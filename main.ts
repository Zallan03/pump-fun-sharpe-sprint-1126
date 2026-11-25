// Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins
// Bounty: u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532
// Account @riyan3w, GitHub Zallan03, repo pump-fun-sharpe-sprint-1126.
//
// Two legs, one profit engine and one guardrail filler:
//
//   Leg 1 — explosive-launch rider (the profit engine). A coin that blasts to
//   >= 20 SOL of real reserves in <= 8 trades and within 100 slots of creation
//   is a handful of large buyers with almost no selling yet — the exact
//   opposite of a slow grinder, which has had time for early holders to sell.
//   Buy it, then exit on a wide band (stop -8%, cap +100%, trailing stop armed
//   at +50% firing on a 15% retrace, velocity exit on a >6% single-batch fall,
//   time stop 12,000 slots) so a completion can pay +100%.
//
//   Leg 2 — guardrail filler (the minimum-size trades). Launches arrive too
//   rarely for the 20-distinct-mint bar, so the bot also takes 0.012 SOL
//   trades on established growers (real reserves >= 2 SOL and >= 20% above
//   ~1000 slots ago), at most 2 open at once, with a tight scalper exit band
//   (stop -5%, cap +8%, velocity exit on a >3% single-batch fall, time stop
//   1,000 slots). They churn fast, bank counted round trips, and bleed as
//   little as possible.
//
// Shared: max 5 open positions; exits are checked before entries, so a sell
// and a buy can use the same slot in one batch; never re-enter a mint once a
// position in it has closed; no duplicate sells; sell slippage 5000 bps so an
// exit goes through. Fully deterministic: no clock, no environment, no
// randomness — every decision is a pure function of the slot number and the
// delivered events, and ties break on the mint string.

import {
  runBot,
  LAMPORTS_PER_SOL,
  type Batch,
  type BotState,
  type OrderInput,
} from "./vendor/makefun-bot.ts";

const SOL = LAMPORTS_PER_SOL;

// --- shared ---------------------------------------------------------------
const MAX_OPEN_POSITIONS = 5;
const BUY_SLIPPAGE_BPS = 1000; // 10%: a launch moves fast; a tight slippage rejects the fills this leg lives on
const SELL_SLIPPAGE_BPS = 5000; // 50%: an exit must go through

// --- leg 1: explosive-launch rider ----------------------------------------
const LAUNCH_MIN_REAL = 20n * SOL; // >= 20 SOL of real reserves
const LAUNCH_MAX_TRADES = 8; // ... in <= 8 trades ...
const LAUNCH_MAX_AGE_SLOTS = 100; // ... and within 100 slots of creation
const LAUNCH_SIZE_CAP = 180_000_000n; // 0.18 SOL: the largest launch buy the 1% cap allows at 20 SOL
const LAUNCH_SIZE_NUM = 9n; // size = 90% of the 1% per-reply size cap ...
const LAUNCH_SIZE_DEN = 10n; // ... capped at 0.18 SOL
const LAUNCH_STOP = 0.92; // hard stop -8% (mark-to-cost ratio)
const LAUNCH_CAP = 2.0; // hard take-profit +100%
const LAUNCH_TRAIL_ARM = 1.5; // trailing stop arms at +50% ...
const LAUNCH_TRAIL_RETRACE = 0.85; // ... and fires on a 15% retrace from peak
const LAUNCH_VELOCITY = 0.94; // velocity exit: >6% fall in a single batch
const LAUNCH_TIME_STOP_SLOTS = 12_000; // ~50 min

// --- leg 2: guardrail filler ----------------------------------------------
const FILLER_SIZE = 12_000_000n; // 0.012 SOL
const FILLER_MIN_REAL = 2n * SOL; // established growers only
const FILLER_GROWTH_NUM = 6n; // real reserves >= 20% above ~1000 slots ago
const FILLER_GROWTH_DEN = 5n;
const FILLER_LOOKBACK_SLOTS = 1000;
const FILLER_MAX_OPEN = 2;
const FILLER_STOP = 0.95; // stop -5%
const FILLER_CAP = 1.08; // cap +8%
const FILLER_VELOCITY = 0.97; // velocity exit: >3% fall in a single batch
const FILLER_TIME_STOP_SLOTS = 1000;

// Reserve samples older than this are pruned (lookback is 1000 slots).
const HISTORY_KEEP_SLOTS = 1200;

type Leg = "launch" | "filler";

interface ReserveSample {
  slot: number;
  real: bigint;
}

interface PositionBook {
  leg: Leg;
  entrySlot: number;
  peakRatio: number;
  prevRatio: number | null;
}

// ---------------------------------------------------------------------------
// Bookkeeping. All of it is a pure function of the delivered batches.
// ---------------------------------------------------------------------------

/** Mints whose position has closed: never re-enter. */
const closedMints = new Set<string>();
/** Exit bookkeeping for every open position. */
const openBook = new Map<string, PositionBook>();
/** Mint -> leg of a buy sent but not yet reported back in a fill. */
const pendingBuyLeg = new Map<string, Leg>();
/** Mint -> TradeEvents seen so far (for the <= 8 trades launch test). */
const tradeCounts = new Map<string, number>();
/** Mint -> (slot, real SOL reserves) samples, oldest first. */
const reserveHistory = new Map<string, ReserveSample[]>();

function sampleReserves(mint: string, sampleSlot: number, real: bigint, nowSlot: number): void {
  let samples = reserveHistory.get(mint);
  if (samples === undefined) {
    samples = [];
    reserveHistory.set(mint, samples);
  }
  samples.push({ slot: sampleSlot, real });
  // Samples arrive in non-decreasing slot order, so pruning from the front is safe.
  const floor = nowSlot - HISTORY_KEEP_SLOTS;
  while (samples.length > 0 && samples[0].slot < floor) samples.shift();
}

/** Real reserves at the latest sample at or before (nowSlot - lookback), or null. */
function reservesLookback(mint: string, nowSlot: number): bigint | null {
  const samples = reserveHistory.get(mint);
  if (samples === undefined) return null;
  const cutoff = nowSlot - FILLER_LOOKBACK_SLOTS;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].slot <= cutoff) return samples[i].real;
  }
  return null;
}

/** Current mark-to-cost ratio of an open position, or null when unpriced. */
function markToCostRatio(state: BotState, mint: string): number | null {
  const curve = state.curves.get(mint);
  const holding = state.positions.get(mint);
  if (curve === undefined || holding === undefined) return null;
  if (curve.virtual_token_reserves === 0n || holding.cost_lamports === 0n) return null;
  // Mark = tokens held * (virtual SOL reserves / virtual token reserves).
  const mark = (holding.token_amount * curve.virtual_quote_reserves) / curve.virtual_token_reserves;
  return Number(mark) / Number(holding.cost_lamports);
}

function hasPendingBuy(state: BotState, mint: string): boolean {
  for (const p of state.pending.values()) {
    if (p.order.side === "buy" && p.order.mint === mint) return true;
  }
  return false;
}

function hasPendingSell(state: BotState, mint: string): boolean {
  for (const p of state.pending.values()) {
    if (p.order.side === "sell" && p.order.mint === mint) return true;
  }
  return false;
}

function onBatch(state: BotState, batch: Batch): OrderInput[] {
  const orders: OrderInput[] = [];
  const slot = batch.slot;

  // --- 1. Fold this batch's fills into the bookkeeping. ------------------
  for (const fill of batch.fills) {
    if (fill.side !== "buy") continue;
    if (fill.status === "filled") {
      const leg = pendingBuyLeg.get(fill.mint) ?? "filler";
      pendingBuyLeg.delete(fill.mint);
      openBook.set(fill.mint, { leg, entrySlot: fill.slot, peakRatio: 0, prevRatio: null });
    } else {
      // Rejected or failed: nothing paid, the mint stays eligible.
      pendingBuyLeg.delete(fill.mint);
    }
  }

  // --- 2. Reconcile the book with the account the harness reports. -------
  // A mint in the book but no longer held has closed (sold, flattened,
  // completed or written off) and is never re-entered.
  for (const mint of [...openBook.keys()]) {
    if (!state.positions.has(mint)) {
      openBook.delete(mint);
      closedMints.add(mint);
    }
  }
  // A held mint with no book entry is a fresh position (its buy filled).
  for (const mint of state.positions.keys()) {
    if (openBook.has(mint)) continue;
    const leg = pendingBuyLeg.get(mint) ?? "filler";
    pendingBuyLeg.delete(mint);
    let entry = slot;
    for (const fill of batch.fills) {
      if (fill.side === "buy" && fill.status === "filled" && fill.mint === mint) {
        entry = fill.slot;
        break;
      }
    }
    openBook.set(mint, { leg, entrySlot: entry, peakRatio: 0, prevRatio: null });
  }

  // --- 3. Walk this batch's events in chain order: count trades, sample
  // reserves, and collect launch candidates. ------------------------------
  const launchCandidates: string[] = [];
  const launchSeen = new Set<string>();
  // Mint -> latest post-trade real SOL reserves seen in this batch.
  const latestReal = new Map<string, bigint>();
  for (const event of batch.events) {
    if (event.event !== "TradeEvent") continue;
    const mint = event.mint;
    const count = (tradeCounts.get(mint) ?? 0) + 1;
    tradeCounts.set(mint, count);
    const real = BigInt(event.real_quote_reserves);
    sampleReserves(mint, event.slot, real, slot);
    latestReal.set(mint, real);
    // Leg 1 fires only on a BUY trade in the current batch.
    if (!event.is_buy) continue;
    if (launchSeen.has(mint)) continue;
    const curve = state.curves.get(mint);
    const created = curve?.created_slot;
    if (created === null || created === undefined) continue; // creation slot unknown: cannot verify the age test
    if (curve.complete) continue; // migrated already: a buy would be rejected token_complete
    if (slot - created > LAUNCH_MAX_AGE_SLOTS) continue;
    if (count > LAUNCH_MAX_TRADES) continue;
    if (real < LAUNCH_MIN_REAL) continue;
    launchSeen.add(mint);
    launchCandidates.push(mint);
  }

  // --- 4. Exits first: every open position, one sell at most per mint. ----
  const txFee = state.txFeeLamports();
  // Tx fees reserved by the sells sent in this batch (a sell pays one too).
  let freeCashReserved = 0n;
  const selling = new Set<string>();
  const heldMints = [...state.positions.keys()].sort();
  for (const mint of heldMints) {
    const book = openBook.get(mint);
    if (book === undefined) continue;
    const ratio = markToCostRatio(state, mint);
    if (ratio === null) continue;
    if (ratio > book.peakRatio) book.peakRatio = ratio;
    const leg = book.leg;
    const stop = leg === "launch" ? LAUNCH_STOP : FILLER_STOP;
    const cap = leg === "launch" ? LAUNCH_CAP : FILLER_CAP;
    const velocity = leg === "launch" ? LAUNCH_VELOCITY : FILLER_VELOCITY;
    const timeStop = leg === "launch" ? LAUNCH_TIME_STOP_SLOTS : FILLER_TIME_STOP_SLOTS;
    let fire = false;
    let why = "";
    if (ratio <= stop) {
      fire = true;
      why = "stop";
    } else if (ratio >= cap) {
      fire = true;
      why = "cap";
    } else if (
      leg === "launch" &&
      book.peakRatio >= LAUNCH_TRAIL_ARM &&
      ratio <= LAUNCH_TRAIL_RETRACE * book.peakRatio
    ) {
      fire = true;
      why = "trail";
    } else if (book.prevRatio !== null && ratio < velocity * book.prevRatio) {
      fire = true;
      why = "velocity";
    } else if (slot - book.entrySlot >= timeStop) {
      fire = true;
      why = "time";
    }
    book.prevRatio = ratio;
    if (!fire) continue;
    // No duplicate sells: a sell already pending on this mint fills first.
    if (hasPendingSell(state, mint)) continue;
    const holding = state.positions.get(mint);
    if (holding === undefined) continue;
    orders.push({
      side: "sell",
      mint,
      token_amount: holding.token_amount,
      max_slippage_bps: SELL_SLIPPAGE_BPS,
    });
    selling.add(mint);
    // A sell pays a tx fee too: reserve it in the cash available for entries.
    freeCashReserved += txFee;
    console.error(
      `[pump-fun-sharpe-sprint-1126] sell ${mint} ${why} ratio=${ratio.toFixed(4)} slot=${slot}`,
    );
  }

  // --- 5. Entries: launches first, then filler. ---------------------------
  // A position sold in this batch frees its slot for a buy decided now:
  // exits are checked before entries, so a sell and a buy can use the same
  // slot in one batch.
  let openCount = state.committedPositionCount() - selling.size;
  let freeCash = state.freeCashLamports() - freeCashReserved;

  const canBuy = (mint: string): boolean => {
    const curve = state.curves.get(mint);
    if (curve?.complete) return false; // migrated already: a buy would be rejected token_complete
    return (
      !closedMints.has(mint) &&
      !state.positions.has(mint) &&
      !hasPendingBuy(state, mint) &&
      !pendingBuyLeg.has(mint)
    );
  };

  // Leg 1 — explosive-launch rider.
  for (const mint of [...launchCandidates].sort()) {
    if (openCount >= MAX_OPEN_POSITIONS) break;
    if (!canBuy(mint)) continue;
    const capLamports = state.maxBuyLamports(mint);
    let size = (capLamports * LAUNCH_SIZE_NUM) / LAUNCH_SIZE_DEN;
    if (size > LAUNCH_SIZE_CAP) size = LAUNCH_SIZE_CAP;
    if (size <= 0n) continue;
    if (freeCash < size + txFee) continue;
    orders.push({ side: "buy", mint, quote_lamports: size, max_slippage_bps: BUY_SLIPPAGE_BPS });
    pendingBuyLeg.set(mint, "launch");
    openCount += 1;
    freeCash -= size + txFee;
    console.error(
      `[pump-fun-sharpe-sprint-1126] buy launch ${mint} size=${size} slot=${slot}`,
    );
  }

  // Leg 2 — guardrail filler: established growers, at most 2 open at once.
  let fillerOpen = 0;
  for (const book of openBook.values()) {
    if (book.leg === "filler") fillerOpen += 1;
  }
  for (const p of state.pending.values()) {
    if (p.order.side === "buy" && pendingBuyLeg.get(p.order.mint) === "filler") fillerOpen += 1;
  }
  for (const mint of selling) {
    const book = openBook.get(mint);
    if (book?.leg === "filler") fillerOpen -= 1;
  }
  const fillerCandidates: string[] = [];
  for (const mint of [...latestReal.keys()].sort()) {
    const real = latestReal.get(mint) ?? 0n;
    if (real < FILLER_MIN_REAL) continue;
    const then = reservesLookback(mint, slot);
    if (then === null) continue;
    if (real * FILLER_GROWTH_DEN < then * FILLER_GROWTH_NUM) continue; // needs real >= 1.2x the ~1000-slot-ago value
    fillerCandidates.push(mint);
  }
  for (const mint of fillerCandidates) {
    if (fillerOpen >= FILLER_MAX_OPEN) break;
    if (openCount >= MAX_OPEN_POSITIONS) break;
    if (!canBuy(mint)) continue;
    const capLamports = state.maxBuyLamports(mint);
    let size = FILLER_SIZE;
    if (size > capLamports) size = capLamports;
    if (size <= 0n) continue;
    if (freeCash < size + txFee) continue;
    orders.push({ side: "buy", mint, quote_lamports: size, max_slippage_bps: BUY_SLIPPAGE_BPS });
    pendingBuyLeg.set(mint, "filler");
    openCount += 1;
    fillerOpen += 1;
    freeCash -= size + txFee;
    console.error(
      `[pump-fun-sharpe-sprint-1126] buy filler ${mint} size=${size} slot=${slot}`,
    );
  }

  return orders;
}

await runBot({
  onHello(state) {
    console.error(
      `[pump-fun-sharpe-sprint-1126] hello: capital=${state.hello.capital.lamports} ` +
        `max_open=${state.hello.caps.max_open_positions} ` +
        `max_order_bps=${state.hello.caps.max_order_bps_of_real_reserve} ` +
        `latency=${state.hello.latency_slots}`,
    );
  },
  onBatch,
  onDone(state) {
    console.error(
      `[pump-fun-sharpe-sprint-1126] done: batches=${state.seq} cash=${state.cash} ` +
        `open=${state.positions.size} closed=${closedMints.size}`,
    );
  },
});
