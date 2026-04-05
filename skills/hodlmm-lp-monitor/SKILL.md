---
name: hodlmm-lp-monitor
description: "Monitors and analyzes Bitflow HODLMM concentrated liquidity positions on Stacks. Use when user asks to \"check my LP position\", \"monitor HODLMM pools\", \"analyze liquidity bins\", \"check pool performance\", \"rebalance strategy\", \"HODLMM yield\", \"concentrated liquidity status\", \"Bitflow LP\", or \"pool health check\". Fetches on-chain data from Bitflow HODLMM pools, evaluates bin utilization, estimates yield, and recommends rebalancing actions."
---

# HODLMM LP Position Monitor

## Overview

This skill monitors Bitflow HODLMM concentrated liquidity positions on the Stacks blockchain. It fetches pool data, analyzes bin distribution and utilization, estimates current yield performance, and provides actionable rebalancing recommendations. Designed for AI agents managing DeFi positions on Bitcoin L2.

## When to Use

- User wants to check health/performance of their HODLMM LP position
- User asks about current pool conditions (volume, TVL, active bins)
- User wants rebalancing advice based on price movement
- User needs yield comparison across HODLMM pools
- Automated periodic position health checks

## Prerequisites

- Agent must have AIBTC MCP tools installed (`npx @aibtc/mcp-server`)
- Agent must have a registered and unlocked Stacks wallet
- Access to Bitflow API endpoints

## Step 1: Fetch Available HODLMM Pools

Query the Bitflow API for active HODLMM pools:

```bash
curl -s "https://app.bitflow.finance/api/pools" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for pool in data:
    if pool.get('type') == 'hodlmm' or 'hodlmm' in pool.get('name','').lower():
        print(f\"Pool: {pool['name']} | TVL: {pool.get('tvl','N/A')} | Volume 24h: {pool.get('volume24h','N/A')}\")
"
```

If the above endpoint is unavailable, check these alternatives:
- `https://api.bitflow.finance/v1/pools`
- `https://app.bitflow.finance/api/v1/hodlmm/pools`

Document which pools are active and their current stats.

## Step 2: Analyze Position Bin Distribution

For a given pool and user address, check the bin layout:

```bash
# Fetch user's LP position details
curl -s "https://app.bitflow.finance/api/hodlmm/positions?address=${STX_ADDRESS}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for pos in data:
    print(f\"Pool: {pos.get('pool','unknown')}\")
    print(f\"Strategy: {pos.get('strategy','unknown')}\")
    print(f\"Bins: {pos.get('activeBins','N/A')}\")
    print(f\"In Range: {pos.get('inRange', 'unknown')}\")
    print(f\"Value: {pos.get('totalValue','N/A')}\")
    print(f\"Unclaimed Fees: {pos.get('unclaimedFees','N/A')}\")
    print('---')
"
```

Key metrics to evaluate:
- **In Range**: Is the current price within the user's liquidity bins?
- **Bin Utilization**: What percentage of bins are actively earning fees?
- **Concentration Score**: How tightly concentrated is the liquidity vs the trading range?

## Step 3: Evaluate Yield Performance

Calculate and report yield metrics:

1. **Fee APR**: (24h fees earned / position value) * 365
2. **Stacking Yield**: sBTC positions earn ~3-5% annualized from Stacks Dual Stacking
3. **Combined Yield**: Fee APR + Stacking Yield
4. **Capital Efficiency**: Compare yield-per-dollar vs a standard AMM position

Present results in this format:

```
HODLMM Position Health Report
=============================
Pool:              sBTC/USDCx
Strategy:          Spot
Position Value:    $X,XXX
Current Price:     $XX,XXX
Position Range:    $XX,XXX - $XX,XXX
In Range:          Yes/No
Active Bins:       X/Y (XX%)

Yield Performance (24h)
-----------------------
Fee Revenue:       $X.XX
Fee APR:           XX.X%
Stacking Yield:    ~X.X%
Combined APR:      XX.X%
Capital Efficiency: X.Xx vs standard AMM

Rebalance Status:  [OK / ATTENTION / ACTION NEEDED]
```

## Step 4: Generate Rebalancing Recommendations

Based on the analysis, provide one of these recommendations:

### Position In Range — No Action
- Current price is within active bins
- Bins are earning fees efficiently
- Recommendation: Hold and monitor. Next check in 24h.

### Position Partially Out of Range — Attention
- Price has moved to the edge of the bin range
- Some bins are inactive (not earning fees)
- Recommendation: Consider widening range or shifting bins toward current price.
- Provide specific bin adjustment: "Shift lower bound from $X to $Y"

### Position Out of Range — Action Needed
- Current price is outside all active bins
- Position is earning zero trading fees (may still earn stacking yield on sBTC)
- Recommendation: Rebalance immediately.
- Suggest new range centered on current price with appropriate spread based on strategy:
  - **Spot strategy**: ±2-5% from current price (tight, high yield, frequent rebalance)
  - **Curve strategy**: ±5-15% (moderate balance)
  - **Bid-Ask strategy**: ±10-25% (wide, less rebalancing needed)

### Impermanent Loss Warning
If position has experienced significant IL:
- Calculate IL percentage vs holding
- Compare IL against accumulated fees
- Report net P&L: fees earned minus IL

## Step 5: Set Up Automated Monitoring (Optional)

If the agent has autonomous loop capability, configure periodic checks:

```
Schedule: Every 4 hours
Action: Run Steps 1-4
Alert Conditions:
  - Position goes out of range → immediate notification
  - Fee APR drops below 5% → flag for review
  - Unclaimed fees exceed $10 → suggest harvesting
  - IL exceeds 2% of position value → warn operator
```

Use AIBTC heartbeat timing to align monitoring intervals.

## Strategy Selection Guide

Help users pick the right HODLMM strategy for their goals:

| Strategy | Range Width | Rebalance Frequency | Best For |
|----------|-------------|---------------------|----------|
| Spot     | ±2-5%       | Daily               | Active managers, max yield |
| Curve    | ±5-15%      | Weekly              | Balanced approach |
| Bid-Ask  | ±10-25%     | Monthly             | Passive LPs, less maintenance |

## Error Handling

- If API returns no data: check if the pool contract is still active on Stacks explorer
- If position shows $0 value: wallet may not have LP tokens, verify address
- If yield seems impossibly high: likely low time sample, wait for 24h+ data
- If Bitflow API is down: fall back to direct Stacks API contract calls

## Sources and References

- Bitflow HODLMM Documentation: https://docs.bitflow.finance
- Bitflow Medium (HODLMM explainer): https://bitflowfinance.medium.com
- BFF Army Education: https://www.bff.army/
- Stacks API for on-chain verification: https://api.stacks.co
- AIBTC Skills Registry: https://aibtc.com/skills
