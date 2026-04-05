#!/usr/bin/env bun
/**
 * HODLMM LP Position Monitor — read-only Bitflow HODLMM pool / bin / position intelligence.
 *
 *   bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts doctor
 *   bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts status [--pool-id dlmm_1] [--wallet SP...]
 *   bun run hodlmm-lp-monitor/hodlmm-lp-monitor.ts analyze [--pool-id dlmm_1] [--band 10]
 */

import { Command } from "commander";

const BITFLOW_HODLMM_API = "https://bff.bitflowapis.finance";
const HIRO_API           = "https://api.mainnet.hiro.so";
const FETCH_TIMEOUT_MS   = 30_000;

interface HodlmmPool {
  pool_id:    string;
  token_x:    string;
  token_y:    string;
  bin_step:   number;
  active_bin: number;
}

interface HodlmmBin {
  bin_id:          number;
  price?:          string;
  reserve_x?:      string;
  reserve_y?:      string;
  liquidity?:      string;
  user_liquidity?: string | number;
}

interface AppPool {
  poolId:      string;
  tvlUsd:      number;
  volumeUsd1d: number;
  apr24h:      number;
  tokens: {
    tokenX: { priceUsd: number; decimals: number };
    tokenY: { decimals: number };
  };
}

interface PoolsResponse { pools?: HodlmmPool[] }
interface BinsResponse { bins?: HodlmmBin[]; active_bin_id?: number }
interface AppPoolsResponse { data?: AppPool[] }
interface UserPositionResponse {
  bins?:          HodlmmBin[];
  position_bins?: HodlmmBin[];
  positions?:     { bins?: HodlmmBin[] };
}

type Out = {
  status: "success" | "error";
  action: string;
  data:   Record<string, unknown>;
  error:  { code: string; message: string; next: string } | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: "application/json", "User-Agent": "bff-skills/hodlmm-lp-monitor" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPools(): Promise<HodlmmPool[]> {
  const data = await fetchJson<PoolsResponse>(`${BITFLOW_HODLMM_API}/api/quotes/v1/pools`);
  return data.pools ?? [];
}

async function fetchPoolBins(poolId: string): Promise<{ active_bin_id: number; bins: HodlmmBin[] }> {
  const data = await fetchJson<BinsResponse>(`${BITFLOW_HODLMM_API}/api/quotes/v1/bins/${poolId}`);
  return { active_bin_id: data.active_bin_id ?? 0, bins: data.bins ?? [] };
}

async function fetchAppPool(poolId: string): Promise<AppPool | null> {
  const data = await fetchJson<AppPoolsResponse>(`${BITFLOW_HODLMM_API}/api/app/v1/pools`);
  return data.data?.find((p) => p.poolId === poolId) ?? null;
}

async function fetchUserPositionBins(address: string, poolId: string): Promise<HodlmmBin[] | null> {
  const url = `${BITFLOW_HODLMM_API}/api/app/v1/users/${address}/positions/${poolId}/bins`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: "application/json", "User-Agent": "bff-skills/hodlmm-lp-monitor" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching user position`);
    const data = await res.json() as UserPositionResponse;
    return (
      Array.isArray(data?.bins)            ? data.bins :
      Array.isArray(data?.position_bins)   ? data.position_bins :
      Array.isArray(data?.positions?.bins) ? (data.positions?.bins ?? []) :
      []
    );
  } finally {
    clearTimeout(timer);
  }
}

function parseLiq(b: HodlmmBin): number {
  const raw = b.liquidity ?? b.reserve_x ?? "0";
  const n   = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickPool(pools: HodlmmPool[], poolId?: string): HodlmmPool | undefined {
  const sbtc = pools.filter(
    (p) => p.token_x.toLowerCase().includes("sbtc") || p.token_y.toLowerCase().includes("sbtc"),
  );
  if (poolId) return pools.find((p) => p.pool_id === poolId);
  return sbtc.find((p) => p.pool_id === "dlmm_1") ?? sbtc[0] ?? pools[0];
}

async function cmdDoctor(): Promise<Out> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  try {
    const pools = await fetchPools();
    checks.push({
      name:   "Bitflow HODLMM pools",
      ok:     pools.length > 0,
      detail: `${pools.length} pools`,
    });
  } catch (e) {
    checks.push({
      name:   "Bitflow HODLMM pools",
      ok:     false,
      detail: String(e),
    });
  }
  try {
    const data = await fetchJson<AppPoolsResponse>(`${BITFLOW_HODLMM_API}/api/app/v1/pools`);
    const n    = data.data?.length ?? 0;
    checks.push({ name: "Bitflow app pools", ok: n > 0, detail: `${n} pools` });
  } catch (e) {
    checks.push({ name: "Bitflow app pools", ok: false, detail: String(e) });
  }
  try {
    await fetchJson<number>(`${HIRO_API}/v2/fees/transfer`);
    checks.push({ name: "Hiro fees", ok: true, detail: "reachable" });
  } catch (e) {
    checks.push({ name: "Hiro fees", ok: false, detail: String(e) });
  }
  const ok = checks.every((c) => c.ok);
  return {
    status: ok ? "success" : "error",
    action: ok ? "DOCTOR_OK" : "DOCTOR_DEGRADED",
    data:   { checks },
    error:  ok
      ? null
      : {
          code:    "DOCTOR",
          message: "One or more probes failed",
          next:    "Fix network access or retry later",
        },
  };
}

async function cmdStatus(poolId?: string, wallet?: string): Promise<Out> {
  if (wallet && !/^SP[A-Z0-9]{30,}$/.test(wallet)) {
    return {
      status: "error",
      action: "VALIDATION",
      data:   {},
      error:  {
        code:    "INVALID_WALLET",
        message: "Wallet must be a Stacks mainnet address (SP...)",
        next:    "Pass valid --wallet or omit for pool-only status",
      },
    };
  }
  const pools = await fetchPools();
  const pool  = pickPool(pools, poolId);
  if (!pool) {
    return {
      status: "error",
      action: "NOT_FOUND",
      data:   {},
      error:  {
        code:    "POOL_NOT_FOUND",
        message: `No pool for id ${poolId ?? "(default)"}`,
        next:    "Run doctor; pass --pool-id",
      },
    };
  }
  const [{ active_bin_id, bins }, app] = await Promise.all([
    fetchPoolBins(pool.pool_id),
    fetchAppPool(pool.pool_id),
  ]);

  let inRange: boolean | null = null;
  let userBinRange: { min: number; max: number; count: number } | null = null;
  let positionNote: string | undefined;

  if (wallet) {
    const ub = await fetchUserPositionBins(wallet, pool.pool_id);
    if (ub === null) {
      inRange      = false;
      positionNote = `No position for ${wallet} in ${pool.pool_id}`;
    } else {
      const ids = ub
        .filter((b) => {
          const liq =
            typeof b.user_liquidity === "number"
              ? b.user_liquidity
              : parseFloat(String(b.user_liquidity ?? "0"));
          return liq > 0;
        })
        .map((b) => b.bin_id)
        .sort((a, z) => a - z);
      if (ids.length === 0) {
        positionNote = "Position record has no bins with user_liquidity > 0";
      } else {
        inRange      = ids.includes(active_bin_id);
        userBinRange = { min: ids[0], max: ids[ids.length - 1], count: ids.length };
      }
    }
  } else {
    positionNote = "No --wallet; in_range not computed";
  }

  return {
    status: "success",
    action: "STATUS_OK",
    data: {
      pool_id:       pool.pool_id,
      active_bin:    active_bin_id,
      bin_step:      pool.bin_step,
      in_range:      inRange,
      user_bin_range: userBinRange,
      position_note: positionNote,
      tvl_usd:       app?.tvlUsd ?? null,
      volume_24h_usd: app?.volumeUsd1d ?? null,
      apr_24h_pct:   app?.apr24h ?? null,
      token_x_price_usd: app?.tokens.tokenX.priceUsd ?? null,
    },
    error: null,
  };
}

async function cmdAnalyze(poolId: string | undefined, band: number): Promise<Out> {
  const pools = await fetchPools();
  const pool  = pickPool(pools, poolId);
  if (!pool) {
    return {
      status: "error",
      action: "NOT_FOUND",
      data:   {},
      error:  {
        code:    "POOL_NOT_FOUND",
        message: `No pool for id ${poolId ?? "(default)"}`,
        next:    "Pass --pool-id",
      },
    };
  }
  const [{ active_bin_id, bins }, app] = await Promise.all([
    fetchPoolBins(pool.pool_id),
    fetchAppPool(pool.pool_id),
  ]);
  if (!bins.length) {
    return {
      status: "error",
      action: "NO_BINS",
      data:   { pool_id: pool.pool_id, active_bin: active_bin_id },
      error:  {
        code:    "EMPTY_BINS",
        message: "Bin ladder empty",
        next:    "Retry later or verify pool id",
      },
    };
  }

  let totalLiq = 0;
  let nearLiq  = 0;
  let binsWithLiq = 0;
  const lo = active_bin_id - band;
  const hi = active_bin_id + band;

  for (const b of bins) {
    const L = parseLiq(b);
    if (L <= 0) continue;
    binsWithLiq++;
    totalLiq += L;
    if (b.bin_id >= lo && b.bin_id <= hi) nearLiq += L;
  }

  const concentrationNearActivePct =
    totalLiq > 0 ? parseFloat(((nearLiq / totalLiq) * 100).toFixed(2)) : 0;
  const binsUtilizationPct =
    parseFloat(((binsWithLiq / bins.length) * 100).toFixed(2));

  let rebalanceHint: string;
  if (concentrationNearActivePct > 70) {
    rebalanceHint =
      "Liquidity is concentrated near the active bin — narrow ranges may compete for the same fees; widening may reduce IL risk but dilute share.";
  } else if (concentrationNearActivePct < 25) {
    rebalanceHint =
      "Liquidity is diffuse vs active bin — out-of-range LPs may be missing fees until they recentre (human-approved tx only).";
  } else {
    rebalanceHint =
      "Moderate concentration — monitor active bin drift vs your position range.";
  }

  return {
    status: "success",
    action: "ANALYZE_COMPLETE",
    data: {
      pool_id:                      pool.pool_id,
      active_bin:                   active_bin_id,
      band_bins:                    band,
      bins_total:                   bins.length,
      bins_with_liquidity:          binsWithLiq,
      bins_utilization_pct:         binsUtilizationPct,
      liquidity_near_active_pct:    concentrationNearActivePct,
      liquidity_total_raw_sum:      parseFloat(totalLiq.toFixed(6)),
      liquidity_near_active_raw_sum: parseFloat(nearLiq.toFixed(6)),
      apr_24h_pct:                  app?.apr24h ?? null,
      volume_24h_usd:               app?.volumeUsd1d ?? null,
      tvl_usd:                      app?.tvlUsd ?? null,
      rebalance_hint:               rebalanceHint,
      methodology:
        "liquidity_raw uses bin.liquidity or reserve_x as a heuristic; not USD-normalized.",
    },
    error: null,
  };
}

function print(out: Out): void {
  console.log(JSON.stringify(out, null, 0));
}

const program = new Command();
program.name("hodlmm-lp-monitor").description("Bitflow HODLMM LP monitor (read-only)");

program
  .command("doctor")
  .description("Probe Bitflow + Hiro endpoints")
  .action(async () => {
    print(await cmdDoctor());
  });

program
  .command("status")
  .description("Pool + optional wallet position vs active bin")
  .option("--pool-id <id>", "HODLMM pool id")
  .option("--wallet <addr>", "Stacks address")
  .action(async (opts: { poolId?: string; wallet?: string }) => {
    print(await cmdStatus(opts.poolId, opts.wallet));
  });

program
  .command("analyze")
  .description("Bin utilization and yield context")
  .option("--pool-id <id>", "HODLMM pool id")
  .option("--band <n>", "Half-width bins around active", (v) => parseInt(v, 10), 10)
  .action(async (opts: { poolId?: string; band: number }) => {
    print(await cmdAnalyze(opts.poolId, opts.band));
  });

program.parse();
