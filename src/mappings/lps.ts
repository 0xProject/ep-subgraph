import { Bytes, log } from '@graphprotocol/graph-ts';
import { Fill } from '../../generated/schema';
import { LiquidityProviderFill } from '../../generated/LiquidityProviders/ILiquidityProvider';
import {
    bytes32ToString,
    SANDBOX_ADDRESS,
    tokenFindOrCreate,
    transactionFindOrCreate,
} from '../utils';

export function handleLiquidityProviderFillEvent(event: LiquidityProviderFill): void {
    // Sender must be the sandbox.
    if (event.params.sender != SANDBOX_ADDRESS as Bytes) {
        return;
    }

    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let source = bytes32ToString(event.params.sourceId);
    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);

    let fill = new Fill(tx.id + '-' + 'LiquidityProviderFill(' + source + ')-' + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.blockNumber = tx.blockNumber;
    fill.logIndex = event.logIndex;
    fill.source = source;
    fill.recipient = event.params.recipient as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.inputTokenAmount;
    fill.outputTokenAmount = event.params.outputTokenAmount;
    fill.sender = event.params.sender as  Bytes;
    fill.provider = event.params.sourceAddress as Bytes;
    fill.save();

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}
