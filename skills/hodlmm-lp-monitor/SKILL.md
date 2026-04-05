---
metadata:
  author: "Bigcent"
  tags: "defi, hodlmm, liquidity, monitoring, bitflow, stacks, read-only, mainnet-only, l2"
  entry: "hodlmm-lp-monitor/hodlmm-lp-monitor.ts"
name: hodlmm-lp-monitor
description: "Monitors and analyzes Bitflow HODLMM concentrated liquidity positions on Stacks. Use when user asks to check LP position, monitor HODLMM pools, analyze liquidity bins, check pool performance, rebalance strategy, HODLMM yield, concentrated liquidity status, Bitflow LP, or pool health check."
---

# HODLMM LP Position Monitor

## What it does

Fetches on-chain data from Bitflow HODLMM concentrated liquidity pools, evaluates bin distribution and utilization, estimates current yield performance, and provides actionable rebalancing recommendations. Returns a structured health report for any HODLMM LP position including fee APR, stacking yield, capital efficiency score, and rebalance status.

## Why agents need it

HODLMM concentrated liquidity positions require active monitoring. Unlike standard AMMs, concentrated liquidity earns zero fees when price moves outside your bins. An agent managing DeFi positions needs to detect out-of-range conditions quickly, estimate yield loss from inactive bins, and recommend rebalancing actions before capital sits idle. This skill automates that entire monitoring loop.

## Safety notes

- This skill only reads on-chain data. It does not execute trades or move funds.
- Rebalancing recommendations are suggestions only. The agent must confirm with the operator before executing any position changes.
- Yield estimates are based on recent data and are not guaranteed. Past performance does not predict future returns.
- Always verify pool contract addresses against the official Bitflow documentation before interacting.
- Never expose wallet private keys or seed phrases in logs or output.

## Commands

### `doctor`

Checks environment readiness: verifies AIBTC MCP tools are installed, wallet is unlocked, and Bitflow API endpoints are reachable.

**Input:** None

**Output:**
```json
{
  "result": "ready",
  "wallet": "unlocked",
  "bitflowApi": "reachable",
  "stacksApi": "reachable"
}
```

### `run`

Executes the full position monitoring flow: fetches pool data, analyzes bin utilization, calculates yield, and generates a health report with rebalancing recommendation.

**Input:**
- `--address <stx-address>` — Stacks address of the LP to monitor
- `--pool <pool-slug>` — (optional) Filter to a specific HODLMM pool

**Output:**
```json
{
  "pool": "sBTC/USDCx",
  "strategy": "spot",
  "positionValue": 5000,
  "currentPrice": 84500,
  "rangeMin": 82000,
  "rangeMax": 87000,
  "inRange": true,
  "activeBins": 12,
  "totalBins": 15,
  "binUtilization": 0.8,
  "feeRevenue24h": 4.25,
  "feeAPR": 31.02,
  "stackingYield": 4.0,
  "combinedAPR": 35.02,
  "capitalEfficiency": 3.2,
  "rebalanceStatus": "OK",
  "recommendation": "Hold and monitor. Next check in 24h."
}
```

### Rebalance Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `OK` | Price within active bins, earning fees | No action needed |
| `ATTENTION` | Price at edge of range, some bins inactive | Consider adjusting range |
| `ACTION_NEEDED` | Price outside all bins, earning zero fees | Rebalance recommended |

### Strategy Guide

| Strategy | Range Width | Rebalance Frequency | Best For |
|----------|-------------|---------------------|----------|
| Spot | ±2-5% | Daily | Active managers, max yield |
| Curve | ±5-15% | Weekly | Balanced approach |
| Bid-Ask | ±10-25% | Monthly | Passive LPs, less maintenance |

## Output contract

All commands return valid JSON to stdout. The `run` command returns an object with these guaranteed fields:

- `pool` (string) — pool name
- `inRange` (boolean) — whether current price is within LP bin range
- `binUtilization` (number, 0-1) — fraction of bins actively earning fees
- `feeAPR` (number) — annualized fee yield as percentage
- `combinedAPR` (number) — fee APR plus stacking yield
- `rebalanceStatus` (string) — one of `OK`, `ATTENTION`, `ACTION_NEEDED`
- `recommendation` (string) — human-readable next action

On error, returns `{ "error": "description" }` with a non-zero exit code.

## Data Sources

- Bitflow HODLMM API: `https://app.bitflow.finance/api/pools`
- Stacks API for on-chain verification: `https://api.stacks.co`
- AIBTC MCP tools for wallet operations
- BFF Army education resources: `https://www.bff.army/`
