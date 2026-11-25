# SPEC — Pump.fun Sharpe Sprint entry (rebuild, 26 Nov 2026)

Bounty: [u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
("Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins", $2 prize, 1st $1).
Account @riyan3w, GitHub Zallan03, repo `pump-fun-sharpe-sprint-1126`.
Scoring: hourly Sharpe ratio on a 6-hour pump.fun forward replay after the
deadline (28 Nov 2026 17:00 UTC); a prize needs net PnL > 0 SOL after all
fees, ≥ 20 distinct mints with round trips of ≥ 0.01 SOL each, and max
drawdown ≤ 50%. Two executions must produce byte-identical action logs.

This is a FRESH rebuild in a new session started after the competition
opened (26 Nov 2026 00:00 WIB). It implements the same strategy as the
25 Nov build (whose dev-window grade is the target to reproduce), written
from the strategy description alone — no old code was read.

## Strategy

Two legs, one profit engine and one guardrail filler.

### Leg 1 — explosive-launch rider (the profit engine)

Buy a coin **only** when it reaches **≥ 20 SOL of real reserves in
≤ 8 trades and within 100 slots of creation**, on a BUY trade in the
current batch. Size: 90% of the 1% per-reply size cap, capped at
**0.18 SOL** (at 20 SOL of real reserves the cap itself is 0.20 SOL, so
0.18 SOL is the largest launch buy the harness allows). Buy slippage
1000 bps (10%): a launch moves fast, and a tight slippage would reject
the very fills this leg lives on.

Exits (mark-to-cost ratio, cost includes the buy's fees):

- Hard stop loss **−8%** (ratio ≤ 0.92)
- Hard take-profit cap **+100%** (ratio ≥ 2.0)
- Trailing stop armed at **+50%**, fires on a **15%** retrace from peak
- Velocity exit: sell when the ratio falls **> 6% in a single batch**
  (a rug / whale dump in progress — a rug can erase 90% of a position
  inside one slot, so this fires on the first sign, not at the stop)
- Time stop **12,000 slots** (~50 min)

### Leg 2 — guardrail filler (minimum-size growth trades)

Launches arrive ~0.5/hour — far too rarely for the 20-distinct-mint
minimum bar in a 6-hour final window. So the bot also takes **0.012 SOL**
filler trades on established growers (real reserves ≥ 2 SOL and ≥ 20%
above ~1000 slots ago), at most **2 open at once** so they can never
crowd out a launch, with a tight scalper exit band: stop **−5%**, cap
**+8%**, velocity exit on a >3% single-batch fall, time stop **1,000
slots**. They churn fast, bank counted round trips, and bleed as little
as possible — their expectancy is negative, so they are kept as small
and as few as the guardrail allows.

### Shared rules

- Max **5** open positions; exits are checked before entries, so a sell
  and a buy can use the same slot in one batch.
- **Never re-enter** a mint once a position in it has closed (sold,
  flattened, or completed).
- **No duplicate sells**: if a sell is already pending on a mint, no
  second sell is sent (it would only be rejected for
  `insufficient_tokens` once the first fills).
- No buys on a curve that already completed (they would be rejected
  `token_complete`).
- Sell slippage 5000 bps (50%): an exit must go through.
- Fully deterministic: no clock, no environment, no randomness. Every
  decision is a pure function of the slot number and the delivered
  events; ties break on the mint string.

## Why this design (what the dev window actually showed)

The dev window (2–3 Nov 2026, 24h, 128,058 events, 1,222 mints created,
1,123 with trades, 35 completions) was analysed trade by trade, and
every plausible entry family was tested in the real grader — not just in
a Python model, because the Python model turned out to be optimistic
about exits (it assumed a stop loss fills at the stop level; in the real
sim a crash keeps falling during the 2-slot fill latency, and sells are
sometimes rejected when real reserves collapse).

- **Fresh-pump chasing loses.** At trade level the first-trade trigger
  wins 78% of the time, but orders fill 2 slots after the decision and
  by then the price has run a median +17.5% past the trigger and is
  about to mean-revert. Tested as a bot: Sharpe −1.272, net −1.257 SOL.
- **Established-growth riding loses.** Real reserves +20% over 1000
  slots, min 2 SOL, trailing exits: Sharpe −0.707, net −0.561 SOL, 111
  trips, win rate 18.9%. The median loss is worse than the stop (−17%
  realised vs −12% stop) and ~7% of trades are one-slot rugs (−90%):
  a coin that looked like a healthy grower (real 77 SOL) was drained
  to ~1 SOL inside a single slot. No price-based exit can catch that.
- **The explosive launch is the one positive entry.** Coins that reach
  20 SOL in ≤ 10 trades complete 54% of the time; 30 SOL in ≤ 10
  trades, 77%; versus ~3% of all coins. Completers reach 30 SOL in a
  median of **6 trades and 0 slots** after creation; non-completers
  take 83 trades and 88 slots. A blast in a handful of trades means a
  few large buyers with almost no selling — the exact opposite of the
  slow grinder, which has had time for early holders to sell.
- **Exits matter as much as the entry.** On the launch leg, a tight
  crash exit (3% single-batch drop) cuts the winners' legs and flips
  the leg negative; arming the trailing stop at +20% instead of +50%
  does the same. Wide exits (arm +50%, drop 15%) are what let a
  completion pay +100%.
- **Size scales PnL, not Sharpe.** Raising the launch cap 0.05 → 0.10 →
  0.18 SOL scales net PnL +0.049 → +0.101 → +0.183 with Sharpe
  ~unchanged (+0.121 → +0.124 → +0.126), as expected: both the mean and
  the standard deviation of hourly returns scale together. 0.18 SOL was
  chosen because it is the largest the cap allows at the 20 SOL entry
  threshold.

## Dev-window results (house `grade-local`, `--driver process`)

Target (25 Nov build, same strategy): net PnL **+0.1097 SOL**, hourly
Sharpe **+0.0774**, Sortino +0.1604, max drawdown 2.68%, win rate 26.1%
(31 / 119), 119 round trips, 119 distinct mints, `ranked: true`.

This rebuild's grade (run 26 Nov 2026, Node v24.22.1 locally; the server's
harness runs Node v26.13.1 — flagged as a version note only, scoring is
unaffected):

| Metric | Value |
|---|---|
| Net PnL | **+0.1557 SOL** (+1.56% on 10 SOL) |
| Hourly Sharpe | **+0.1184** |
| Sortino | +0.3274 |
| Max drawdown | 3.00% (cap 50%) |
| Win rate | 29.2% (31 / 106) |
| Round trips | 106 |
| Distinct mints (≥ 0.01 SOL) | 106 (minimum bar: 20) |
| Fills | 212 (rejected 2, failed txs 6) |
| Fees | 0.1094 SOL curve fees + 0.0229 SOL tx fees |
| Cost sensitivity (2× fees) | +0.0226 SOL (still positive) |
| 90% bootstrap interval | −0.449 to +0.801 SOL |
| Determinism | `ranked: true`; `l1.reproduced: true` (the house engine ran the bot twice; the action logs match) |

The rebuild beats the 25 Nov target on every headline metric (net
+0.1557 vs +0.1097 SOL, Sharpe +0.1184 vs +0.0774, Sortino +0.3274 vs
+0.1604, win rate 29.2% vs 26.1%) with fewer round trips (106 vs 119)
and far fewer rejected orders (2 vs 22 — the completed-curve guard
keeps `token_complete` buys from being sent). The top 3 coins supply
70.4% of the gains; net without them is −0.357 SOL — the same lumpiness
the caveats below describe.

### Honest caveats (read before submitting)

- **The edge is lumpy, and the stress test confirms it.** Split by
  halves, the dev window is −0.160 SOL in the first 12h and +0.269 SOL
  in the second; by 6-hour slices: −0.128, −0.030, +0.033, +0.241
  (Sharpes −0.45, −1.42, +0.10, +0.41). And `grade-local --stress 10`
  (10 rebuilt copies of the dev window) gives net PnL +0.46, −0.25,
  −0.17, −0.19, −0.06, −0.04, −0.08, +0.13, −0.11, −0.41 SOL:
  **median −0.095 SOL, only 2 of 10 copies positive, the dev score
  (+0.110) above 8 of 10 copies.** Per the kit's own guidance, that
  means the dev score leans on this window's particular coins. The
  final 6-hour window is a fresh draw — the honest expectation is
  roughly a 20–30% chance of PnL > 0, with the wins, when they come,
  being larger than the losses. No parameter variant tested made the
  edge smooth, and loosening the launch filter to get more trades
  (≤ 15 trades, or ≥ 15 SOL) made the leg negative.
- **The filler drag is real.** The filler leg is negative-expectancy by
  design (fees alone are ~3.5% of a 0.012 SOL round trip); it exists
  only to clear the 20-mint bar. In a 6-hour final window it should
  still produce ~25–30 counted round trips, comfortably above 20.
- **Rugs are unavoidable.** A one-slot −90% rug cannot be exited
  before the fact; the velocity exit only limits the damage on crashes
  that unfold over several slots. The 0.18 SOL launch size means one
  rug costs ≈ 0.16 SOL.

## Files

- `main.ts` — the bot (zero dependencies, Node ≥ 22.6)
- `vendor/makefun-bot.ts` — vendored shim from the kit SDK (not authored here)
- `package.json` — zero dependencies, `"type": "module"`, Node ≥ 22.6
- `README.md` — short summary + bounty link
- `SPEC.md` — this file
- `LICENSE` — MIT
- `.gitignore` — node_modules, logs

## Local verification

- `grade-local --kit . --bot <repo> --driver process --json`:
  finished, no error, `ranked: true`, `l1.reproduced: true`, net
  +0.1557 SOL, Sharpe +0.1184, 106 distinct mints, drawdown 3.00%.
  (Eligibility shows `prize_eligible: false` only because no transcript
  bundle was passed to the local run — `no_transcripts` /
  `cost_unpriced`; the bundle is attached at submit time.)
  Full output saved to
  `hidden_files/build-1028/localsim/grade-v4-sharpe2.json`
  (`result_sha256 96d25a186449e4fa2dd21b3abec01ae220b5e1fbdbd5e8064f0920ad013bffab`,
  `action_log_sha256 6916f0835b4b88f96053d407b186b19a893da968e284d8eefa9206ee70a8ea8d`).
- Determinism: the bot reads no clock, environment, or random source;
  all ordering ties break on the mint string.
