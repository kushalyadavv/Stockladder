import { fetchProductSalesMetrics, buildSalesRankMap } from "./sales.js";
import { loadGa4Metrics, buildGa4RankMap } from "./ga4.js";
import { fetchBestsellerRank } from "./sort.js";
import { assertFeature, assertOrdersBudget } from "./plan-guard.js";
import { recordShopUsage } from "./shop-store.js";

const SALES_MODES = new Set([
  "sales_units",
  "sales_revenue",
  "sales_then_inventory",
  "revenue_then_inventory",
]);

const SALES_STRATEGIES = new Set([
  "sales_then_inventory",
  "revenue_then_inventory",
]);

const GA4_MODES = new Set(["ga4_views", "ga4_atc"]);

export function resolveSalesMetric(config) {
  const mode = config.withinTierSort ?? config.sortStrategy ?? "";
  if (mode === "sales_revenue" || mode === "revenue_then_inventory") {
    return "revenue";
  }
  return "units";
}

export function needsSalesData(config) {
  const mode = config.withinTierSort ?? "";
  const strategy = config.sortStrategy ?? "";
  return (
    SALES_MODES.has(mode) ||
    SALES_STRATEGIES.has(strategy) ||
    mode.startsWith("sales_")
  );
}

export function needsGa4Data(config) {
  const mode = config.withinTierSort ?? "";
  return GA4_MODES.has(mode);
}

export async function enrichSortConfig(
  client,
  collection,
  config,
  planContext = null,
) {
  const enriched = { ...config };

  if (enriched.sortStrategy === "bestselling_then_inventory") {
    enriched.bestsellerRank = await fetchBestsellerRank(
      client,
      collection.id,
    );
  }

  if (needsSalesData(enriched)) {
    if (planContext?.plan) {
      assertFeature(planContext.plan, "salesSort", "growth");
      assertOrdersBudget(planContext.plan, planContext.usage);
    }

    const days = enriched.salesLookbackDays ?? 30;
    const metric = resolveSalesMetric(enriched);
    const sales = await fetchProductSalesMetrics(client, days);

    if (planContext?.shop && sales.orderCount > 0) {
      recordShopUsage(planContext.shop, {
        ordersScanned: sales.orderCount,
      });
      planContext.usage.ordersScanned += sales.orderCount;
    }

    enriched.salesMetrics = sales.metrics;
    enriched.salesAccessDenied = sales.accessDenied;
    if (sales.accessDenied) {
      enriched._warnings = [
        ...(enriched._warnings ?? []),
        sales.message,
      ];
    } else {
      enriched.salesRank = buildSalesRankMap(sales.metrics, metric);
    }
  }

  if (needsGa4Data(enriched)) {
    if (planContext?.plan) {
      assertFeature(planContext.plan, "ga4Import", "pro");
    }
    const ga4 = loadGa4Metrics();
    const field =
      enriched.withinTierSort === "ga4_atc" ? "atcRate" : "views";
    enriched.ga4Metrics = ga4;
    enriched.ga4Rank = buildGa4RankMap(ga4, field);
  }

  return enriched;
}
