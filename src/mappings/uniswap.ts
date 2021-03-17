import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Fill, Token } from '../../generated/schema';
import { UniswapPair, Swap } from '../../generated/Uniswap/UniswapPair';
import { UniswapPairFactory } from '../../generated/Uniswap/UniswapPairFactory';
import { EXCHANGE_PROXY_ADDRESS, takerFindOrCreate, tokenFindOrCreate, transactionFindOrCreate } from '../utils';

let PANCAKESWAP_FACTORY_ADDRESS = Address.fromHexString('0xBCfCcbde45cE874adCB698cC183deBcF17952812');
let BAKERYSWAP_FACTORY_ADDRESS = Address.fromHexString('0x01bF7C66c6BD861915CdaaE475042d3c4BaE16A7');
let SUSHISWAP_FACTORY_ADDRESS = Address.fromHexString('0xc35DADB65012eC5796536bD9864eD8773aBc74C4');

export function handleUniswapSwap(event: Swap): void {
    // We're only interested in ones from the EP because those are from
    // `sellToUniswap()`.
    if (event.params.sender != EXCHANGE_PROXY_ADDRESS) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let taker = takerFindOrCreate(event.params.to); // sus

    let info = getPairInfo(event.address);
    if (!info.isValid()) {
        return;
    }

    let inputToken: Token;
    let outputToken: Token;
    let inputTokenAmount: BigInt;
    let outputTokenAmount: BigInt;
    if (event.params.amount1In.isZero()) {
        inputToken = info.token0 as Token;
        outputToken = info.token1 as Token;
        inputTokenAmount = event.params.amount0In as BigInt;
        outputTokenAmount = event.params.amount1Out as BigInt;
    } else {
        inputToken = info.token1 as Token;
        outputToken = info.token0 as Token;
        inputTokenAmount = event.params.amount1In as BigInt;
        outputTokenAmount = event.params.amount0Out as BigInt;
    }

    let fill = new Fill(tx.id + '-' + info.source + '-' + event.logIndex.toString());
    fill.blockNumber = tx.blockNumber;
    fill.transaction = tx.id;
    fill.logIndex = event.logIndex;
    fill.source = info.source;
    fill.recipient = Address.fromHexString(taker.id) as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = inputTokenAmount;
    fill.outputTokenAmount = outputTokenAmount;
    fill.sender = event.params.sender;
    fill.provider = event.address;
    fill.save();

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

class PairInfo {
    public source: string | null;
    public token0: Token | null;
    public token1: Token | null;

    public isValid(): boolean {
        return !!this.source && !!this.token0 && !!this.token1;
    }
}

function getPairInfo(pairAddress: Address): PairInfo {
    let info = new PairInfo();
    let pair = UniswapPair.bind(pairAddress);
    let pairFactoryResult = pair.try_factory();
    if (pairFactoryResult.reverted) {
        return info;
    }
    let pairFactoryAddress = Address.fromHexString(pairFactoryResult.value.toHexString()) as Address;
    if (pairFactoryAddress == PANCAKESWAP_FACTORY_ADDRESS) {
        info.source = 'PancakeSwap';
    } else if (pairFactoryAddress == BAKERYSWAP_FACTORY_ADDRESS) {
        info.source = 'BakerySwap';
    } else if (pairFactoryAddress == SUSHISWAP_FACTORY_ADDRESS) {
        info.source = 'SushiSwap';
    } else {
        return info;
    }
    let token0Result = pair.try_token0();
    let token1Result = pair.try_token1();
    if (token0Result.reverted || token1Result.reverted) {
        return info;
    }
    {
        // Validate pair contract was created by factory.
        let factory = UniswapPairFactory.bind(pairFactoryAddress);
        let pairResult = factory.try_getPair(token0Result.value, token1Result.value);
        if (pairResult.reverted || pairResult.value != pairAddress) {
            return info;
        }
    }
    info.token0 = tokenFindOrCreate(token0Result.value);
    info.token1 = tokenFindOrCreate(token1Result.value);
    return info;
}
