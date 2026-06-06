import { DEFAULT_SORT_RULE_STACK } from "./collection-config.js";

export const PLAN_IDS = ["free", "growth", "pro"];

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    trialDays: 0,
    limits: {
      maxCollectionsWithSort: 10,
      maxCollectionRuleOverrides: 2,
      maxOrdersPerMonth: 500,
      maxProducts: 10_000,
      sortFrequencyMinutes: 60,
    },
    features: {
      inventorySort: true,
      pushOosDown: true,
      hideOos: false,
      collectionAnalytics: true,
      ruleStack: false,
      advancedRules: false,
      salesSort: false,
      variantSort: false,
      webhooks: false,
      abCompare: false,
      seasonalSync: false,
      smartMirrors: false,
      ga4Import: false,
    },
    highlights: [
      "Up to 10 collections with advanced sort",
      "Up to 2 per-collection rule overrides",
      "Up to 500 orders/month for sales sort",
      "Up to 10,000 products",
      "Hourly automated sort",
      "Collection analytics",
      "Push out-of-stock to bottom",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 9,
    trialDays: 7,
    limits: {
      maxCollectionsWithSort: 50,
      maxCollectionRuleOverrides: 20,
      maxOrdersPerMonth: 1000,
      maxProducts: 10_000,
      sortFrequencyMinutes: 60,
    },
    features: {
      inventorySort: true,
      pushOosDown: true,
      hideOos: true,
      collectionAnalytics: true,
      ruleStack: true,
      advancedRules: true,
      salesSort: true,
      variantSort: true,
      webhooks: true,
      abCompare: false,
      seasonalSync: false,
      smartMirrors: false,
      ga4Import: false,
    },
    highlights: [
      "Up to 50 collections with advanced sort",
      "Up to 20 per-collection rule overrides",
      "Up to 1,000 orders/month for sales sort",
      "Rule stack, tag/vendor promote & demote",
      "Sales-based sort & variant swatch sort",
      "Hide OOS & inventory webhooks",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19,
    trialDays: 7,
    limits: {
      maxCollectionsWithSort: 100,
      maxCollectionRuleOverrides: 50,
      maxOrdersPerMonth: 5000,
      maxProducts: 10_000,
      sortFrequencyMinutes: 60,
    },
    features: {
      inventorySort: true,
      pushOosDown: true,
      hideOos: true,
      collectionAnalytics: true,
      ruleStack: true,
      advancedRules: true,
      salesSort: true,
      variantSort: true,
      webhooks: true,
      abCompare: true,
      seasonalSync: true,
      smartMirrors: true,
      ga4Import: true,
    },
    highlights: [
      "Up to 100 collections with advanced sort",
      "Up to 50 per-collection rule overrides",
      "Up to 5,000 orders/month for sales sort",
      "A/B strategy compare",
      "Seasonal collections & smart mirrors",
      "GA4 metrics import",
    ],
  },
};

const SALES_STRATEGIES = new Set([
  "sales_then_inventory",
  "revenue_then_inventory",
]);

export function getPlan(planId) {
  return PLANS[planId] ?? PLANS.free;
}

export function listPlansForDisplay() {
  return PLAN_IDS.map((id) => {
    const p = PLANS[id];
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      trialDays: p.trialDays,
      limits: p.limits,
      features: p.features,
      highlights: p.highlights,
    };
  });
}

export function clampCollectionRules(rules, maxOverrides) {
  const entries = Object.entries(rules ?? {});
  if (entries.length <= maxOverrides) return rules ?? {};
  return Object.fromEntries(entries.slice(0, maxOverrides));
}

export function applyPlanToConfig(config, plan) {
  const next = { ...config };

  if (!plan.features.hideOos && next.outOfStockAction === "hide") {
    next.outOfStockAction = "push_down";
  }

  if (!plan.features.variantSort) {
    next.sortVariantsByInventory = false;
  }

  if (!plan.features.advancedRules) {
    next.promoteTags = [];
    next.demoteTags = [];
    next.promoteVendors = [];
    next.demoteVendors = [];
  }

  if (!plan.features.ruleStack) {
    next.sortRuleStack = [...DEFAULT_SORT_RULE_STACK];
  }

  if (!plan.features.salesSort && SALES_STRATEGIES.has(next.sortStrategy)) {
    next.sortStrategy = "inventory_full";
  }

  if (!plan.features.seasonalSync) {
    next.seasonalCollections = [];
  }

  if (!plan.features.smartMirrors) {
    next.smartCollectionMirrors = [];
  }

  next.collectionRules = clampCollectionRules(
    next.collectionRules,
    plan.limits.maxCollectionRuleOverrides,
  );

  return next;
}

export function configUsesSalesSort(config) {
  return (
    SALES_STRATEGIES.has(config.sortStrategy) ||
    config.withinTierSort === "sales_units" ||
    config.withinTierSort === "sales_revenue"
  );
}
