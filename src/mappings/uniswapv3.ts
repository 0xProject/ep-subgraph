import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Fill, Token } from '../../generated/schema';
import { UniswapV3Pool, Swap } from '../../generated/UniswapV3/UniswapV3Pool';
import { UniswapV3Factory } from '../../generated/UniswapV3/UniswapV3Factory';
import { EXCHANGE_PROXY_ADDRESS, takerFindOrCreate, tokenFindOrCreate, transactionFindOrCreate } from '../utils';

let UNISWAP_V3_FACTORY_ADDRESS = Address.fromHexString('0x1F98431c8aD98523631AE4a59f267346ea31F984');
let ZERO = BigInt.fromI32(0);

export function handleUniswapV3Swap(event: Swap): void {
    // We're only interested in ones from the EP because those are from
    // `sellToUniswap()`.
    if (event.params.sender != EXCHANGE_PROXY_ADDRESS) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let taker = takerFindOrCreate(event.params.recipient); // sus

    let info = getPoolInfo(event.address);
    if (!info.isValid()) {
        return;
    }

    let inputToken: Token;
    let outputToken: Token;
    let inputTokenAmount: BigInt;
    let outputTokenAmount: BigInt;
    if (event.params.amount0.gt(ZERO)) {
        inputToken = info.token0 as Token;
        outputToken = info.token1 as Token;
        inputTokenAmount = event.params.amount0 as BigInt;
        outputTokenAmount = event.params.amount1.neg() as BigInt;
    } else {
        inputToken = info.token1 as Token;
        outputToken = info.token0 as Token;
        inputTokenAmount = event.params.amount1 as BigInt;
        outputTokenAmount = event.params.amount0.neg() as BigInt;
    }

    let fill = new Fill(tx.id + '-UniswapV3-' + event.logIndex.toString());
    fill.blockNumber = tx.blockNumber;
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.logIndex = event.logIndex;
    fill.source = 'UniswapV3';
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

class PoolInfo {
    public token0: Token | null;
    public token1: Token | null;

    public isValid(): boolean {
        return !!this.token0 && !!this.token1;
    }
}

function getPoolInfo(pairAddress: Address): PoolInfo {
    let info = new PoolInfo();
    let pool = UniswapV3Pool.bind(pairAddress);
    let pairFactoryResult = pool.try_factory();
    if (pairFactoryResult.reverted) {
        return info;
    }
    let pairFactoryAddress = Address.fromHexString(pairFactoryResult.value.toHexString()) as Address;
    if (pairFactoryAddress != UNISWAP_V3_FACTORY_ADDRESS) {
        return info; // invalid pool
    }
    let token0Result = pool.try_token0();
    let token1Result = pool.try_token1();
    let feeResult = pool.try_fee();
    if (token0Result.reverted || token1Result.reverted || feeResult.reverted) {
        return info;
    }
    {
        // Validate pool contract was created by factory.
        let factory = UniswapV3Factory.bind(pairFactoryAddress);
        let pairResult = factory.try_getPool(token0Result.value, token1Result.value, feeResult.value);
        if (pairResult.reverted || pairResult.value != pairAddress) {
            return info;
        }
    }
    info.token0 = tokenFindOrCreate(token0Result.value);
    info.token1 = tokenFindOrCreate(token1Result.value);
    return info;
}
