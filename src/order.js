import {
  DEFAULT_SORT_RULE_STACK,
  getEffectiveRuleStack,
} from "./collection-config.js";
import { getSalesMetric } from "./sales.js";
import { getGa4Metric } from "./ga4.js";

export function effectiveInventory(product, config) {
  if (config.useOnlineInventory && product.variants?.length) {
    return product.variants.reduce(
      (sum, v) => sum + (v.sellableOnlineQuantity ?? v.inventoryQuantity ?? 0),
      0,
    );
  }
  return product.totalInventory ?? 0;
}

function hasAnyTag(product, tags) {
  if (!tags?.length) return false;
  const set = new Set(product.tags ?? []);
  return tags.some((t) => set.has(t));
}

export function isPinned(product, config) {
  const pinTags = config.pinTags ?? ["featured", "pin-top"];
  return hasAnyTag(product, pinTags);
}

function classifyRule(product, config) {
  const inv = product.inventory;
  const threshold = config.lowStockThreshold ?? 5;

  if (product.pinned) return "pinned";
  if (hasAnyTag(product, config.promoteTags)) return "promoted_tags";
  if (
    product.vendor &&
    config.promoteVendors?.length &&
    config.promoteVendors.includes(product.vendor)
  ) {
    return "promoted_vendors";
  }
  if (!product.tracksInventory) return "untracked";
  if (inv <= 0) return "out_of_stock";
  if (product.deprioritized) return "deprioritized";
  if (hasAnyTag(product, config.demoteTags)) return "demoted_tags";
  if (
    product.vendor &&
    config.demoteVendors?.length &&
    config.demoteVendors.includes(product.vendor)
  ) {
    return "demoted_vendors";
  }
  if (threshold > 0 && inv > 0 && inv <= threshold) return "low_stock";
  if (inv > 0) return threshold > 0 ? "in_stock_high" : "in_stock_default";
  return "in_stock_default";
}

export function classifyProductRule(product, config) {
  const inv = effectiveInventory(product, config);
  const scored = {
    inventory: inv,
    tracksInventory: product.tracksInventory ?? true,
    tags: product.tags ?? [],
    vendor: product.vendor ?? "",
    pinned: isPinned(product, config),
    deprioritized: (config.deprioritizedProductIds ?? new Set()).has(product.id),
  };
  return classifyRule(scored, config);
}

function ruleTier(rule, config) {
  const stack = getEffectiveRuleStack(config);
  const idx = stack.indexOf(rule);
  return idx === -1 ? stack.length : idx;
}

function withinTierSortMode(config) {
  if (config.withinTierSort) return config.withinTierSort;

  const strategy = config.sortStrategy ?? "inventory_full";
  if (strategy === "oos_bottom_only") return "manual";
  if (strategy === "bestselling_then_inventory") return "bestselling";
  if (strategy === "sales_then_inventory") return "sales_units";
  if (strategy === "revenue_then_inventory") return "sales_revenue";
  return config.sortDirection === "asc" ? "inventory_asc" : "inventory_desc";
}

function compareWithinTier(a, b, config) {
  const mode = withinTierSortMode(config);

  if (mode === "manual") {
    return a.originalIndex - b.originalIndex;
  }

  if (mode === "bestselling") {
    const aRank = config.bestsellerRank?.get(a.id) ?? 999999;
    const bRank = config.bestsellerRank?.get(b.id) ?? 999999;
    if (aRank !== bRank) return aRank - bRank;
  }

  if (mode === "sales_units" || mode === "sales_revenue") {
    const metric = mode === "sales_revenue" ? "revenue" : "units";
    const aSales = getSalesMetric(a.id, config.salesMetrics, metric);
    const bSales = getSalesMetric(b.id, config.salesMetrics, metric);
    if (aSales !== bSales) return bSales - aSales;
  }

  if (mode === "ga4_views" || mode === "ga4_atc") {
    const field = mode === "ga4_atc" ? "atcRate" : "views";
    const aGa4 = getGa4Metric(a.handle, config.ga4Metrics, field);
    const bGa4 = getGa4Metric(b.handle, config.ga4Metrics, field);
    if (aGa4 !== bGa4) return bGa4 - aGa4;
  }

  if (mode === "created_desc" || mode === "created_asc") {
    const aTime = new Date(a.createdAt ?? 0).getTime();
    const bTime = new Date(b.createdAt ?? 0).getTime();
    if (aTime !== bTime) {
      return mode === "created_desc" ? bTime - aTime : aTime - bTime;
    }
  }

  const direction = mode === "inventory_asc" ? 1 : -1;
  if (a.inventory !== b.inventory) {
    return direction * (a.inventory - b.inventory);
  }

  return a.originalIndex - b.originalIndex;
}

export function computeDesiredOrder(products, config) {
  const untrackedTop = config.untrackedPosition !== "bottom";
  const deprioritized = config.deprioritizedProductIds ?? new Set();

  const scored = products.map((p, index) => ({
    id: p.id,
    handle: p.handle ?? "",
    title: p.title,
    vendor: p.vendor ?? "",
    createdAt: p.createdAt,
    inventory: effectiveInventory(p, config),
    tracksInventory: p.tracksInventory ?? true,
    tags: p.tags ?? [],
    pinned: isPinned(p, config),
    deprioritized: deprioritized.has(p.id),
    originalIndex: index,
  }));

  for (const p of scored) {
    p.rule = classifyRule(p, config);
    p.tier = ruleTier(p.rule, config);
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) {
      if (a.rule === "untracked" || b.rule === "untracked") {
        const aU = a.rule === "untracked";
        const bU = b.rule === "untracked";
        if (untrackedTop) return aU ? -1 : bU ? 1 : a.tier - b.tier;
        return aU ? 1 : bU ? -1 : a.tier - b.tier;
      }
      return a.tier - b.tier;
    }

    return compareWithinTier(a, b, config);
  });

  let ordered = scored.map((p) => p.id);

  if (config.outOfStockAction === "hide") {
    const oosIds = new Set(
      scored
        .filter((p) => p.inventory <= 0 && p.tracksInventory)
        .map((p) => p.id),
    );
    ordered = ordered.filter((id) => !oosIds.has(id));
  }

  return ordered;
}

export { DEFAULT_SORT_RULE_STACK };
