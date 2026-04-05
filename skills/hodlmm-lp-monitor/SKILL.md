---
name: hodlmm-lp-monitor
description: "Monitors Bitflow HODLMM concentrated liquidity for a pool and optional wallet position: active bin context, liquidity concentration near the peg, realized APR from app stats, and read-only rebalancing guidance. Uses Bitflow public APIs only — no chain writes."
metadata:
  author: "innoc"
  author-agent: "Flash Globe"
  user-invocable: "false"
  arguments: "doctor | status | analyze"
  entry: "hodlmm-lp-monitor/hodlmm-lp-monitor.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2"
---

# HODLMM LP Position Monitor

Concentrated-liquidity monitor for Bitflow HODLMM (DLMM) pools. Surfaces **where liquidity is sitting relative to the active bin**, **how much TVL is earning fees right now**, and a **simple yield readout** (24h APR, volume, TVL) so agents can reason about whether a rebalance is worth discussing with a human operator.

## What it does

1. **`status`** — Resolves the pool (default: `dlmm_1` sBTC pool), fetches active bin, optional Stacks `user_liquidity` bins for `--wallet`, and compares position range vs active bin (in-range / out-of-range / unknown).
2. **`analyze`** — Scans the full bin ladder for the pool, estimates **bin utilization**: share of bins with non-zero liquidity, and what fraction of *total reported bin liquidity* sits within ±`--band` bins of the active bin. Combines with app-reported **APR (24h)**, **24h volume**, and **TVL** to characterize fee-earning conditions.
3. **`doctor`** — Verifies Bitflow HODLMM quotes + app pools endpoints (and optional Hiro fee probe) are reachable.

## Why agents need it

`hodlmm-bin-guardian` focuses on **binary in-range checks** and rebalance gates. This skill adds **portfolio-level context**: is the curve crowded at the active bin, is liquidity diffuse, and is short-term APR/volume supportive of moving range? It targets the **HODLMM bonus** category by making DLMM structure legible to agents planning LP workflows.

## Safety notes

- **Read-only** — never submits transactions or moves funds.
- **Mainnet-only** — Bitflow HODLMM endpoints used here are mainnet-facing.
- **Heuristic utilization** — bin liquidity sums use on-chain-reported bin fields; treat as indicative, not accounting-grade.
- **Rebalance recommendations** are **advisory**; any add/remove liquidity requires explicit human approval and separate signing flows.

## Commands

### doctor

```bash
bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts doctor
```

### status

```bash
bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts status
bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts status --pool-id dlmm_1 --wallet SP1ABC...
```

### analyze

```bash
bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts analyze --pool-id dlmm_1
bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts analyze --pool-id dlmm_1 --band 12
```

Options:
- `--pool-id` — HODLMM pool id (default: first sBTC pool or `dlmm_1`).
- `--wallet` — Stacks address for position-aware status (same as Bin Guardian).
- `--band` — Half-width in bins around active bin for concentration stats (default: `10`).

## Output contract

All stdout is **single JSON** per invocation.

**Success shape (representative):**
```json
{
  "status": "success",
  "action": "ANALYZE_COMPLETE",
  "data": { },
  "error": null
}
```

**Error shape:**
```json
{
  "status": "error",
  "action": "FAILED",
  "data": {},
  "error": { "code": "STRING", "message": "human readable", "next": "what to try" }
}
```

## Known constraints

- Requires **Bun** + network access to `https://bff.bitflowapis.finance` (and optionally Hiro for `doctor`).
- Large bin arrays can take a few seconds — `fetch` timeout is 30s.
- If Bitflow changes bin schema, utilization ratios may need adjustment.
