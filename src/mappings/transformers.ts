import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Fill } from '../../generated/schema';
import { BridgeFill, BridgeFill1, ERC20BridgeTransfer } from '../../generated/Transformers/TransformerEvents';
import {
    bytes32ToString,
    EXCHANGE_PROXY_ADDRESS,
    FLASH_WALLET_ADDRESS,
    tokenFindOrCreate,
    transactionFindOrCreate,
} from '../utils';

export function handleLegacyBridgeFillEvent(event: BridgeFill): void {
    // Event must come from FW.
    if (event.address != FLASH_WALLET_ADDRESS as Bytes) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let source = legacyBridgeSourceIdToSource(event.params.source);
    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);

    let fill = new Fill(tx.id + '-' + 'LegacyBridgeFill(' + source + ')-' + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.blockNumber = tx.blockNumber;
    fill.logIndex = event.logIndex;
    fill.source = source;
    fill.recipient = FLASH_WALLET_ADDRESS as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.inputTokenAmount;
    fill.outputTokenAmount = event.params.outputTokenAmount;
    fill.sender = EXCHANGE_PROXY_ADDRESS as  Bytes;
    fill.provider = bigIntToAddress(event.params.source) as Bytes;
    fill.save();

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

export function handleBridgeFillEvent(event: BridgeFill1): void {
    // Event must come from FW.
    if (event.address != FLASH_WALLET_ADDRESS as Bytes) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    // Lower 16 is the source ID
    let source = bytes32ToString(event.params.source.subarray(16) as Bytes);
    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);

    let fill = new Fill(tx.id + '-' + 'BridgeFill(' + source + ')-' + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.blockNumber = tx.blockNumber;
    fill.logIndex = event.logIndex;
    fill.source = source;
    fill.recipient = FLASH_WALLET_ADDRESS as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.inputTokenAmount;
    fill.outputTokenAmount = event.params.outputTokenAmount;
    fill.sender = EXCHANGE_PROXY_ADDRESS as  Bytes;
    // Upper 16 is the protocol ID
    fill.provider = bytesToBytes32(event.params.source.subarray(0, 16) as Bytes);
    fill.save();

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

export function handleERC20BridgeTransferEvent(event: ERC20BridgeTransfer): void {
    // Event must come from FW.
    if (event.address != FLASH_WALLET_ADDRESS as Bytes) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let source = event.params.from.toHexString();
    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);

    let fill = new Fill(tx.id + '-' + 'ERC20BridgeTransfer(' + source + ')-' + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.blockNumber = tx.blockNumber;
    fill.logIndex = event.logIndex;
    fill.source = source;
    fill.recipient = FLASH_WALLET_ADDRESS as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.inputTokenAmount;
    fill.outputTokenAmount = event.params.outputTokenAmount;
    fill.sender = EXCHANGE_PROXY_ADDRESS as  Bytes;
    fill.provider = event.params.from as Bytes;
    fill.save();

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

function bigIntToAddress(i: BigInt): Address {
    let s = i.toHexString();
    // Left-pad.
    return Bytes.fromHexString('0x' + s.slice(2).padStart(64, '0')) as Address;
}

function bytesToBytes32(b: Bytes): Bytes {
    let s = b.toHexString();
    // Left-pad.
    return Bytes.fromHexString('0x' + s.slice(2).padStart(64, '0')) as Bytes;
}

function legacyBridgeSourceIdToSource(sourceId: BigInt): string {
    switch (sourceId.toI32()) {
        case 0:
            return 'Balancer';
        case 1:
            return 'Bancor';
        case 2:
            return 'CoFiX';
        case 3:
            return 'Curve';
        case 4:
            return 'Cream';
        case 5:
            return 'CryptoCom';
        case 6:
            return 'Dodo';
        case 7:
            return 'Kyber';
        case 8:
            return 'LiquidityProvider';
        case 9:
            return 'Mooniswap';
        case 10:
            return 'MStable';
        case 11:
            return 'Oasis';
        case 12:
            return 'Shell';
        case 13:
            return 'Snowswap';
        case 14:
            return 'Sushiswap';
        case 15:
            return 'Swerve';
        case 16:
            return 'Uniswap';
        case 17:
            return 'UniswapV2';
        case 18:
            return 'Dodov2';
        case 19:
            return 'Linkswap';
        default:
            log.warning('encountered unknown BridgeFill source ID: {}', [sourceId.toString()]);
            return 'Unknown';
    }
}
