import { Command } from "commander";

const program = new Command();

program
  .name("hodlmm-lp-monitor")
  .description("Monitor Bitflow HODLMM concentrated liquidity positions");

program
  .command("doctor")
  .description("Check environment readiness")
  .action(async () => {
    try {
      const bitflowCheck = await fetch("https://app.bitflow.finance/api/pools");
      const stacksCheck = await fetch("https://api.stacks.co/v2/info");

      console.log(
        JSON.stringify({
          result: "ready",
          bitflowApi: bitflowCheck.ok ? "reachable" : "unreachable",
          stacksApi: stacksCheck.ok ? "reachable" : "unreachable",
        })
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          result: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
      process.exit(1);
    }
  });

program
  .command("run")
  .description("Execute full position monitoring")
  .requiredOption("--address <stx-address>", "Stacks address of the LP")
  .option("--pool <pool-slug>", "Filter to a specific HODLMM pool")
  .action(async (opts) => {
    try {
      // Fetch pool data from Bitflow
      const poolsRes = await fetch("https://app.bitflow.finance/api/pools");
      if (!poolsRes.ok) {
        console.log(JSON.stringify({ error: "Failed to fetch Bitflow pools" }));
        process.exit(1);
      }

      const pools = await poolsRes.json();

      // Filter HODLMM pools
      const hodlmmPools = pools.filter(
        (p: any) =>
          p.type === "hodlmm" ||
          (p.name && p.name.toLowerCase().includes("hodlmm"))
      );

      if (opts.pool) {
        const filtered = hodlmmPools.filter(
          (p: any) => p.slug === opts.pool || p.name === opts.pool
        );
        if (filtered.length === 0) {
          console.log(
            JSON.stringify({ error: `Pool "${opts.pool}" not found` })
          );
          process.exit(1);
        }
      }

      // Fetch position data for the given address
      const positionsRes = await fetch(
        `https://app.bitflow.finance/api/hodlmm/positions?address=${opts.address}`
      );

      if (!positionsRes.ok) {
        // If positions endpoint not available, return pool overview
        const poolSummaries = hodlmmPools.map((p: any) => ({
          pool: p.name || p.slug || "unknown",
          tvl: p.tvl || "N/A",
          volume24h: p.volume24h || "N/A",
        }));

        console.log(
          JSON.stringify({
            address: opts.address,
            positions: [],
            availablePools: poolSummaries,
            recommendation:
              "No position data found. Verify address or check available pools.",
          })
        );
        return;
      }

      const positions = await positionsRes.json();

      // Analyze each position
      const reports = positions.map((pos: any) => {
        const activeBins = pos.activeBins || 0;
        const totalBins = pos.totalBins || 1;
        const binUtilization = activeBins / totalBins;
        const inRange = pos.inRange ?? binUtilization > 0;

        // Calculate yield metrics
        const feeRevenue24h = pos.fees24h || 0;
        const positionValue = pos.totalValue || 0;
        const feeAPR =
          positionValue > 0 ? (feeRevenue24h / positionValue) * 365 * 100 : 0;
        const stackingYield = 4.0; // sBTC stacking ~3-5% annualized
        const combinedAPR = feeAPR + stackingYield;
        const capitalEfficiency = feeAPR > 0 ? feeAPR / 10 : 0; // vs ~10% standard AMM baseline

        // Determine rebalance status
        let rebalanceStatus = "OK";
        let recommendation = "Hold and monitor. Next check in 24h.";

        if (!inRange) {
          rebalanceStatus = "ACTION_NEEDED";
          recommendation =
            "Price is outside your bin range. Position is earning zero trading fees. Rebalance to center bins around current price.";
        } else if (binUtilization < 0.5) {
          rebalanceStatus = "ATTENTION";
          recommendation = `Only ${Math.round(binUtilization * 100)}% of bins are active. Consider narrowing your range to improve capital efficiency.`;
        }

        return {
          pool: pos.pool || "unknown",
          strategy: pos.strategy || "unknown",
          positionValue,
          currentPrice: pos.currentPrice || null,
          rangeMin: pos.rangeMin || null,
          rangeMax: pos.rangeMax || null,
          inRange,
          activeBins,
          totalBins,
          binUtilization: Math.round(binUtilization * 100) / 100,
          feeRevenue24h: Math.round(feeRevenue24h * 100) / 100,
          feeAPR: Math.round(feeAPR * 100) / 100,
          stackingYield,
          combinedAPR: Math.round(combinedAPR * 100) / 100,
          capitalEfficiency: Math.round(capitalEfficiency * 10) / 10,
          rebalanceStatus,
          recommendation,
        };
      });

      console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
      process.exit(1);
    }
  });

program.parse();
