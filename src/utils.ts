import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import { ERC20 } from '../generated/ExchangeProxy/ERC20';
import { ERC20SymbolBytes } from '../generated/ExchangeProxy/ERC20SymbolBytes';
import { IZeroEx } from '../generated/ExchangeProxy/IZeroEx';
import { Fill, Maker, Swap, Taker, Token, Transaction } from '../generated/schema';

export let WETH_ADDRESS = Address.fromHexString('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') as Address;
export let EXCHANGE_PROXY_ADDRESS = Address.fromHexString('0xdef1c0ded9bec7f1a1670819833240f027b25eff') as Address;
export let SANDBOX_ADDRESS = Address.fromHexString('0xde7b2747624a647600fdb349184d0448ab954929') as Address;
export let FLASH_WALLET_ADDRESS = Address.fromHexString('0xdb6f1920a889355780af7570773609bd8cb1f498') as Address;

Math.seedRandom(1337);

export function getRandomNumber(): number {
    return i32(Math.round(Math.random() * 1e9));
}

export function normalizeTokenAddress(token: Address): Address {
    if (token.toHexString() == '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return WETH_ADDRESS;
    }
    return token;
}

export function fetchTokenSymbol(tokenAddress: Address): string {
    if (tokenAddress.toHexString() == '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return 'ETH';
    }
    let contract = ERC20.bind(tokenAddress);
    let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress);
    // try types string and bytes32 for symbol
    let symbolValue = 'unknown';
    let symbolResult = contract.try_symbol();
    if (symbolResult.reverted) {
        let symbolResultBytes = contractSymbolBytes.try_symbol();
        if (!symbolResultBytes.reverted) {
            // for broken pairs that have no symbol function exposed
            if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
                symbolValue = symbolResultBytes.value.toString();
            }
        }
    } else {
        symbolValue = symbolResult.value;
    }

    return symbolValue;
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
    if (tokenAddress.toHexString() == '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return BigInt.fromI32(18);
    }
    let contract = ERC20.bind(tokenAddress);
    // try types uint8 for decimals
    let decimalValue = null;
    let decimalResult = contract.try_decimals();
    if (!decimalResult.reverted) {
        decimalValue = decimalResult.value;
    }
    return BigInt.fromI32(decimalValue as i32);
}

// https://github.com/Uniswap/uniswap-v2-subgraph/blob/master/src/mappings/helpers.ts
export function isNullEthValue(value: string): boolean {
    return value == '0x0000000000000000000000000000000000000000000000000000000000000001';
}

export function transactionFindOrCreate(txHash: Bytes, block: ethereum.Block): Transaction {
    let tx = Transaction.load(txHash.toHexString());
    if (!tx) {
        tx = new Transaction(txHash.toHexString());
        tx.timestamp = block.timestamp;
        tx.blockNumber = block.number;
        tx.fills = [];
        tx.save();
    }
    return tx!;
}

export function tokenFindOrCreate(address: Address): Token {
    let token = Token.load(normalizeTokenAddress(address).toHexString());
    if (!token) {
        token = new Token(address.toHexString());
        token.symbol = fetchTokenSymbol(address);
        token.decimals = fetchTokenDecimals(address);
        token.rfqOrderVolume = BigInt.fromI32(0);
        token.limitOrderVolume = BigInt.fromI32(0);
        token.swapVolume = BigInt.fromI32(0);
        token.save();
    }
    return token!;
}

export function takerFindOrCreate(address: Address): Taker {
    let taker = Taker.load(address.toHexString());
    if (!taker) {
        taker = new Taker(address.toHexString());
        taker.swapCount = BigInt.fromI32(0);
        taker.nativeOrderFillCount = BigInt.fromI32(0);
        taker.save();
    }
    return taker!;
}

export function makerFindOrCreate(address: Address): Maker {
    let maker = Maker.load(address.toHexString());
    if (!maker) {
        maker = new Maker(address.toHexString());
        maker.nativeOrderFillCount = BigInt.fromI32(0);
        maker.save();
    }
    return maker!;
}

// Why are templates (and therefore .map()) unable to compile?
export function fillsToIds(fills: Fill[]): string[] {
    let r = [] as string[];
    for (let i = 0; i < fills.length; ++i) {
        r.push(fills[i].id);
    }
    return r;
}

 export function bytes32ToString(b: Bytes): string {
     let chars = [] as string[];
     for (let i = 0; i < b.length; ++i) {
         if (b[i] === 0) {
             break;
         }
         chars.push(String.fromCharCode(b[i]));
     }
     return chars.join('');
 }
