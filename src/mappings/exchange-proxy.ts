import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
    BatchFillCall,
    LimitOrderFilled,
    LiquidityProviderSwap,
    MultiHopFillCall,
    RfqOrderFilled,
    SellToUniswapCall,
    TransformedERC20
} from '../../generated/ExchangeProxy/IZeroEx';
import { Fill, NativeOrderFill, Swap, Transaction } from '../../generated/schema';
import {
    EXCHANGE_PROXY_ADDRESS,
    fillsToIds,
    FLASH_WALLET_ADDRESS,
    getRandomNumber,
    makerFindOrCreate,
    normalizeTokenAddress,
    SANDBOX_ADDRESS,
    takerFindOrCreate,
    tokenFindOrCreate,
    transactionFindOrCreate,
} from '../utils';

export function handleTransformedERC20Event(event: TransformedERC20): void {
    log.debug('found transformERC20 swap in tx {}', [event.transaction.hash.toHex()]);
    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let taker = takerFindOrCreate(event.params.taker);

    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);
    inputToken.swapVolume =
        inputToken.swapVolume.plus(event.params.inputTokenAmount);
    outputToken.swapVolume =
        outputToken.swapVolume.plus(event.params.outputTokenAmount);
    inputToken.save();
    outputToken.save();

    let swap = new Swap(tx.id + '-' + event.logIndex.toString());
    swap.transaction = tx.id;
    swap.timestamp = tx.timestamp;
    swap.blockNumber = tx.blockNumber;
    swap.logIndex = event.logIndex;
    swap.method = 'TransformERC20';
    swap.fills = fillsToIds(findTransformERC20Fills(tx, event.logIndex));
    swap.inputToken = inputToken.id;
    swap.outputToken = outputToken.id;
    swap.inputTokenAmount = event.params.inputTokenAmount;
    swap.outputTokenAmount = event.params.outputTokenAmount;
    swap.taker = taker.id;
    swap.save();

    {
        taker.swapCount = taker.swapCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        tx.lastSwap = swap.id;
        tx.save();
    }
}

export function handleSellToLiquidityProviderSwapEvent(event: LiquidityProviderSwap): void {
    log.debug('found sellToLiquidityProvider swap in tx {}', [event.transaction.hash.toHex()]);
    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let taker = takerFindOrCreate(event.params.recipient); // sus

    let inputToken = tokenFindOrCreate(event.params.inputToken);
    let outputToken = tokenFindOrCreate(event.params.outputToken);
    inputToken.swapVolume =
        inputToken.swapVolume.plus(event.params.inputTokenAmount);
    outputToken.swapVolume =
        outputToken.swapVolume.plus(event.params.outputTokenAmount);
    inputToken.save();
    outputToken.save();

    // TODO: Capture LP events as fills instead of making a fake one?
    let fills = findLiquidityProviderFills(tx, event.logIndex);
    if (fills.length === 0) {
        // If no fill event was found, create a fake one.
        let fill = new Fill(tx.id + '-' + event.params.provider.toHexString() + '-' + event.logIndex.toString());
        fill.transaction = tx.id;
        fill.timestamp = tx.timestamp;
        fill.blockNumber = tx.blockNumber;
        fill.logIndex = event.logIndex;
        fill.source = 'LiquidityProvider';
        fill.recipient = event.params.recipient as Bytes;
        fill.provider = event.params.provider as Bytes;
        fill.sender = EXCHANGE_PROXY_ADDRESS;
        fill.inputToken = inputToken.id;
        fill.outputToken = outputToken.id;
        fill.inputTokenAmount = event.params.inputTokenAmount;
        fill.outputTokenAmount = event.params.outputTokenAmount;
        fill.save();
        fills = [fill];
        {
            let txFills = tx.fills;
            txFills.push(fill.id);
            tx.fills = txFills;
        }
    }

    let swap = new Swap(tx.id + '-' + event.logIndex.toString());
    swap.transaction = tx.id;
    swap.blockNumber = tx.blockNumber;
    swap.timestamp = tx.timestamp;
    swap.logIndex = event.logIndex;
    swap.method = 'LiquidityProvider';
    swap.fills = fillsToIds(fills);
    swap.inputToken = inputToken.id;
    swap.outputToken = outputToken.id;
    swap.inputTokenAmount = event.params.inputTokenAmount;
    swap.outputTokenAmount = event.params.outputTokenAmount;
    swap.taker = taker.id;
    swap.hint = event.params.provider.toHexString();
    swap.save();

    {
        taker.swapCount = taker.swapCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        tx.lastSwap = swap.id;
        tx.save();
    }
}

export function handleRfqOrderFilledEvent(event: RfqOrderFilled): void {
    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let maker = makerFindOrCreate(event.params.maker);
    let taker = takerFindOrCreate(event.params.taker);

    let inputToken = tokenFindOrCreate(event.params.takerToken);
    let outputToken = tokenFindOrCreate(event.params.makerToken);
    inputToken.rfqOrderVolume =
        inputToken.rfqOrderVolume.plus(event.params.takerTokenFilledAmount);
    outputToken.rfqOrderVolume =
        outputToken.rfqOrderVolume.plus(event.params.makerTokenFilledAmount);
    inputToken.save();
    outputToken.save();

    let fill = new Fill(tx.id + event.params.orderHash.toHex() + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.timestamp = tx.timestamp;
    fill.blockNumber = tx.blockNumber;
    fill.logIndex = event.logIndex;
    fill.source = 'RfqOrder';
    fill.recipient = Bytes.fromHexString(taker.id) as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.takerTokenFilledAmount;
    fill.outputTokenAmount = event.params.makerTokenFilledAmount;
    fill.provider = event.params.maker as Bytes;
    fill.save();

    let nativeFill = new NativeOrderFill(
        tx.id + '-' + event.params.orderHash.toHex() + '-' + event.logIndex.toString(),
    );
    nativeFill.transaction = tx.id;
    nativeFill.timestamp = tx.timestamp;
    nativeFill.blockNumber = tx.blockNumber;
    nativeFill.type = 'RfqOrder';
    nativeFill.orderHash = event.params.orderHash;
    nativeFill.maker = maker.id;
    nativeFill.taker = taker.id;
    nativeFill.inputToken = fill.inputToken;
    nativeFill.outputToken = fill.outputToken;
    nativeFill.inputTokenAmount = fill.inputTokenAmount;
    nativeFill.outputTokenAmount = fill.outputTokenAmount;
    nativeFill.pool = event.params.pool;
    nativeFill.fee = BigInt.fromI32(0);
    nativeFill.save();

    {
        maker.nativeOrderFillCount = maker.nativeOrderFillCount.plus(BigInt.fromI32(1));
        maker.save();
    }

    {
        taker.nativeOrderFillCount = taker.nativeOrderFillCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

export function handleLimitOrderFilledEvent(event: LimitOrderFilled): void {
    let tx = transactionFindOrCreate(event.transaction.hash, event.block);
    let maker = makerFindOrCreate(event.params.maker);
    let taker = takerFindOrCreate(event.params.taker);

    let inputToken = tokenFindOrCreate(event.params.takerToken);
    let outputToken = tokenFindOrCreate(event.params.makerToken);
    inputToken.limitOrderVolume =
        inputToken.limitOrderVolume.plus(event.params.takerTokenFilledAmount);
    outputToken.limitOrderVolume =
        outputToken.limitOrderVolume.plus(event.params.makerTokenFilledAmount);
    inputToken.save();
    outputToken.save();

    let fill = new Fill(tx.id + event.params.orderHash.toHex()  + event.logIndex.toString());
    fill.transaction = tx.id;
    fill.blockNumber = tx.blockNumber;
    fill.timestamp = tx.timestamp;
    fill.logIndex = event.logIndex;
    fill.source = 'LimitOrder';
    fill.recipient = Bytes.fromHexString(taker.id) as Bytes;
    fill.inputToken = inputToken.id;
    fill.outputToken = outputToken.id;
    fill.inputTokenAmount = event.params.takerTokenFilledAmount;
    fill.outputTokenAmount = event.params.makerTokenFilledAmount;
    fill.provider = event.params.maker as Bytes;
    fill.save();

    let nativeFill = new NativeOrderFill(
        tx.id + '-' + event.params.orderHash.toHex() + '-' + event.logIndex.toString(),
    );
    nativeFill.transaction = tx.id;
    nativeFill.blockNumber = tx.blockNumber;
    nativeFill.timestamp = tx.timestamp;
    nativeFill.type = 'LimitOrder';
    nativeFill.maker = maker.id;
    nativeFill.taker = taker.id;
    nativeFill.orderHash = event.params.orderHash;
    nativeFill.inputToken = fill.inputToken;
    nativeFill.outputToken = fill.outputToken;
    nativeFill.inputTokenAmount = fill.inputTokenAmount;
    nativeFill.outputTokenAmount = fill.outputTokenAmount;
    nativeFill.pool = event.params.pool;
    nativeFill.fee = event.params.protocolFeePaid;
    nativeFill.save();

    {
        maker.nativeOrderFillCount = maker.nativeOrderFillCount.plus(BigInt.fromI32(1));
        maker.save();
    }

    {
        taker.nativeOrderFillCount = taker.nativeOrderFillCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        let txFills = tx.fills;
        txFills.push(fill.id);
        tx.fills = txFills;
        tx.save();
    }
}

export function handleSellToUniswapCall(call: SellToUniswapCall): void {
    log.debug('found sellToUniswap swap in tx {}', [call.transaction.hash.toHex()]);
    let tokenPath = call.inputs.tokens;

    if (tokenPath.length < 2) {
        return;
    }

    let tx = transactionFindOrCreate(call.transaction.hash, call.block);
    let fills = findSellToUniswapEventFills(tx, call);
    if (fills.length === 0) {
        // If no fills were found, the TX reverted.
        return;
    }
    let taker = takerFindOrCreate(call.from);

    let inputToken = tokenFindOrCreate(tokenPath[0]);
    let outputToken = tokenFindOrCreate(tokenPath[tokenPath.length - 1]);
    inputToken.swapVolume = inputToken.swapVolume.plus(call.inputs.sellAmount);
    outputToken.swapVolume = outputToken.swapVolume.plus(call.outputs.buyAmount);
    inputToken.save();
    outputToken.save();

    let r = getRandomNumber();
    let swap = new Swap(tx.id + '-' + r.toString());
    swap.transaction = tx.id;
    swap.timestamp = tx.timestamp;
    swap.blockNumber = tx.blockNumber;
    swap.method = 'UniswapVIP';
    swap.fills = fillsToIds(fills);
    swap.inputToken = inputToken.id;
    swap.outputToken = outputToken.id;
    swap.inputTokenAmount = call.inputs.sellAmount;
    swap.outputTokenAmount = call.outputs.buyAmount;
    swap.taker = taker.id;
    swap.hint = call.inputs.isSushi ? 'Sushiswap' : 'UniswapV2';
    swap.save();

    {
        taker.swapCount = taker.swapCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        tx.lastSwap = swap.id;
        tx.save();
    }
}

export function handleBatchFillCall(call: BatchFillCall): void {
    log.debug('found batchFill swap in tx {}', [call.transaction.hash.toHex()]);
    let taker = takerFindOrCreate(call.from);
    let fillData = call.inputs.fillData;
    let inputToken = tokenFindOrCreate(fillData.inputToken);
    let outputToken = tokenFindOrCreate(fillData.outputToken);

    let tx = transactionFindOrCreate(call.transaction.hash, call.block);
    let fills = findSwapEventFills(tx); // sus
    inputToken.swapVolume = inputToken.swapVolume.plus(fillData.sellAmount);
    outputToken.swapVolume = outputToken.swapVolume.plus(call.outputs.outputTokenAmount);
    inputToken.save();
    outputToken.save();

    let r = getRandomNumber();
    let swap = new Swap(tx.id + '-' + r.toString());
    swap.transaction = tx.id;
    swap.timestamp = tx.timestamp;
    swap.blockNumber = tx.blockNumber;
    swap.method = 'BatchFill';
    swap.fills = fillsToIds(fills);
    swap.inputToken = inputToken.id;
    swap.outputToken = outputToken.id;
    swap.inputTokenAmount = fillData.sellAmount;
    swap.outputTokenAmount = call.outputs.outputTokenAmount;
    swap.taker = taker.id;
    swap.save();

    {
        taker.swapCount = taker.swapCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        tx.lastSwap = swap.id;
        tx.save();
    }
}

export function handleMultiHopFillCall(call: MultiHopFillCall): void {
    log.debug('found multiHopFill swap in tx {}', [call.transaction.hash.toHex()]);
    let taker = takerFindOrCreate(call.from);
    let fillData = call.inputs.fillData;
    let tokens = fillData.tokens;
    if (tokens.length < 2) {
        return;
    }
    let inputToken = tokenFindOrCreate(tokens[0]);
    let outputToken = tokenFindOrCreate(tokens[tokens.length - 1]);

    let tx = transactionFindOrCreate(call.transaction.hash, call.block);
    let fills = findSwapEventFills(tx); // sus
    inputToken.swapVolume = inputToken.swapVolume.plus(fillData.sellAmount);
    outputToken.swapVolume = outputToken.swapVolume.plus(call.outputs.outputTokenAmount);
    inputToken.save();
    outputToken.save();

    let r = getRandomNumber();
    let swap = new Swap(tx.id + '-' + r.toString());
    swap.transaction = tx.id;
    swap.timestamp = tx.timestamp;
    swap.blockNumber = tx.blockNumber;
    swap.method = 'MultiHopFill';
    swap.fills = fillsToIds(fills);
    swap.inputToken = inputToken.id;
    swap.outputToken = outputToken.id;
    swap.inputTokenAmount = fillData.sellAmount;
    swap.outputTokenAmount = call.outputs.outputTokenAmount;
    swap.taker = taker.id;
    swap.save();

    {
        taker.swapCount = taker.swapCount.plus(BigInt.fromI32(1));
        taker.save();
    }

    {
        tx.lastSwap = swap.id;
        tx.save();
    }
}

function findTransformERC20Fills(tx: Transaction, logIndex: BigInt): Fill[] {
    let fills = findSwapEventFills(tx, logIndex);
    const r = [] as Fill[];
    for (let i = 0; i < fills.length; ++i) {
        // Flash wallet must be recipient.
        if (fills[i].recipient != FLASH_WALLET_ADDRESS as Bytes) {
            continue;
        }
        // If there is a sender, the EP must be it.
        // (native fills will not populate sender).
        if (fills[i].sender) { // Don't ask me why these two can't be in the same if()
            if (fills[i].sender as Bytes != EXCHANGE_PROXY_ADDRESS as Bytes) {
                continue;
            }
        }
        r.push(fills[i]);
    }
    if (r.length === 0) {
        log.warning('could not find transformERC20 fills for tx {}', [tx.id]);
    }
    return r;
}

function findLiquidityProviderFills(tx: Transaction, logIndex: BigInt): Fill[] {
    let fills = findSwapEventFills(tx, logIndex);
    const r = [] as Fill[];
    for (let i = 0; i < fills.length; ++i) {
        // Must contain "LiquidityProviderFill" in ID.
        if (fills[i].id.indexOf('LiquidityProviderFill') === -1) {
            continue;
        }
        // There must be a sender.
        if (!fills[i].sender) {
            continue;
        }
        // The sandbox must be the sender.
        if (fills[i].sender as Bytes == SANDBOX_ADDRESS as Bytes) {
            continue;
        }
        r.push(fills[i]);
    }
    if (r.length === 0) {
        log.warning('could not find sellToLiquidityProvider fills for tx {}', [tx.id]);
    }
    return r;
}

function findSellToUniswapEventFills(tx: Transaction, call: SellToUniswapCall): Fill[] {
    let tokenPath = call.inputs.tokens;
    if (tokenPath.length < 2) {
        return [];
    }
    let inputToken = normalizeTokenAddress(tokenPath[0]).toHexString();
    let outputToken = normalizeTokenAddress(tokenPath[tokenPath.length - 1]).toHexString();
    let source = call.inputs.isSushi ? 'Sushiswap' : 'UniswapV2';
    // First grab all fills for the correct DEX that come from the EP.
    let fills = [] as Fill[];
    {
        let _fills = findSwapEventFills(tx);
        for (let i = 0; i < _fills.length; ++i) {
            let f = _fills[i];
            if (f.source == source && f.sender == EXCHANGE_PROXY_ADDRESS) {
                fills.push(f);
            }
        }
    }
    // Look for a single fill selling the input token amd buying the output token.
    for (let i = 0; i < fills.length; ++i) {
        let f = fills[i];
        if (f.inputToken == inputToken && f.outputToken == outputToken) {
            return [f];
        }
    }
    // Couldn't find a single A->B fill. Maybe it's a multi-hop. Try to find
    // the A->X and X->B fills and grab everything inbetween.
    for (let i = 0; i < fills.length - 1; ++i) {
        if (fills[i].inputToken == inputToken) {
            for (let j = i + 1; j < fills.length; ++j) {
                if (fills[j].outputToken == outputToken) {
                    return fills.slice(i, j + 1);
                }
            }
        }
    }
    // Oh well. 🤷
    log.warning('could not find {} VIP fills for tx {}', [source, tx.id]);
    return [];
}

export function findSwapEventFills(tx: Transaction, logIndex: BigInt | null = null): Fill[] {
    // Get the previous swap in this tx.
    let prevSwap: Swap | null = tx.lastSwap
        ? Swap.load(tx.lastSwap)
        : null;
    let txFills = tx.fills; // can't index directly
    let fills = [] as Fill[];
    for (let i = 0; i < txFills.length; ++i) {
        let fillId = txFills[i];
        let fill = Fill.load(fillId) as Fill;
        if (!fill.logIndex) {
            continue;
        }
        // Must be after the previous swap's event (if there is one)
        if (prevSwap) {
            if (prevSwap.logIndex) {
                if ((prevSwap.logIndex as BigInt).gt((fill.logIndex as BigInt))) {
                    continue;
                }
            }
        }
        if (logIndex) {
            // Must be before this swap event.
            if (logIndex.lt((fill.logIndex as BigInt))) {
                continue;
            }
        }
        fills.push(fill!);
    }
    return fills;
}
