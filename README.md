# Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins

Paper-trading bot for the [Pump.fun Sharpe Sprint](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532) bounty on make.fun. It trades paper SOL on a 6-hour pump.fun forward replay, ranked by hourly Sharpe ratio.

[![make.fun badge](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Zallan03/pump-fun-sharpe-sprint-1126/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Zallan03/pump-fun-sharpe-sprint-1126/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

## Strategy

Two legs, one profit engine and one guardrail filler. See [SPEC.md](SPEC.md).

- **Leg 1 — explosive-launch rider:** buy only a coin that reaches ≥ 20 SOL of real reserves in ≤ 8 trades and within 100 slots of creation, on a BUY trade. Size 0.18 SOL. Exits: hard stop −8%, take-profit +100%, trailing stop armed at +50% firing on a 15% retrace, velocity exit on a >6% single-batch fall, time stop 12,000 slots.
- **Leg 2 — guardrail filler:** 0.012 SOL trades on established growers (real reserves ≥ 2 SOL and ≥ 20% above ~1000 slots ago), at most 2 open at once. Exits: stop −5%, cap +8%, velocity exit on a >3% single-batch fall, time stop 1,000 slots.

Shared: max 5 open positions, exits checked before entries, never re-enter a mint once a position in it has closed, no duplicate sells, fully deterministic.

## Run

```sh
node main.ts
```

Zero dependencies, Node ≥ 22.6. The bot speaks `agent-fun/replay/v2` on stdin/stdout via the vendored shim in `vendor/`.
