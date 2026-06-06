import {
  applyPlanToConfig,
  configUsesSalesSort,
  clampCollectionRules,
} from "./plans.js";

export class PlanError extends Error {
  constructor(message, code = "PLAN_LIMIT", upgradePlan = "growth") {
    super(message);
    this.name = "PlanError";
    this.code = code;
    this.upgradePlan = upgradePlan;
  }
}

export function assertFeature(plan, feature, upgradePlan = "growth") {
  if (!plan.features[feature]) {
    const label = feature.replace(/([A-Z])/g, " $1").toLowerCase();
    throw new PlanError(
      `${label} requires a plan upgrade`,
      "PLAN_FEATURE",
      upgradePlan,
    );
  }
}

export function validateConfigForPlan(config, plan) {
  const ruleCount = Object.keys(config.collectionRules ?? {}).length;
  if (ruleCount > plan.limits.maxCollectionRuleOverrides) {
    throw new PlanError(
      `Per-collection rules limited to ${plan.limits.maxCollectionRuleOverrides} on ${plan.name}`,
      "PLAN_LIMIT",
      plan.id === "free" ? "growth" : "pro",
    );
  }

  if (!plan.features.hideOos && config.outOfStockAction === "hide") {
    throw new PlanError(
      "Hide out-of-stock requires Growth plan or higher",
      "PLAN_FEATURE",
      "growth",
    );
  }

  if (!plan.features.variantSort && config.sortVariantsByInventory) {
    throw new PlanError(
      "Variant swatch sort requires Growth plan or higher",
      "PLAN_FEATURE",
      "growth",
    );
  }

  if (!plan.features.advancedRules) {
    const hasAdvanced =
      (config.promoteTags?.length ?? 0) > 0 ||
      (config.demoteTags?.length ?? 0) > 0 ||
      (config.promoteVendors?.length ?? 0) > 0 ||
      (config.demoteVendors?.length ?? 0) > 0;
    if (hasAdvanced) {
      throw new PlanError(
        "Tag/vendor promote & demote requires Growth plan or higher",
        "PLAN_FEATURE",
        "growth",
      );
    }
  }

  if (!plan.features.seasonalSync && (config.seasonalCollections?.length ?? 0) > 0) {
    throw new PlanError(
      "Seasonal collections require Pro plan",
      "PLAN_FEATURE",
      "pro",
    );
  }

  if (!plan.features.smartMirrors && (config.smartCollectionMirrors?.length ?? 0) > 0) {
    throw new PlanError(
      "Smart collection mirrors require Pro plan",
      "PLAN_FEATURE",
      "pro",
    );
  }

  if (!plan.features.salesSort && configUsesSalesSort(config)) {
    throw new PlanError(
      "Sales-based sort requires Growth plan or higher",
      "PLAN_FEATURE",
      "growth",
    );
  }
}

export function prepareConfigForPlan(config, plan) {
  validateConfigForPlan(config, plan);
  return applyPlanToConfig(config, plan);
}

export function limitSortTargets(targets, plan, { singleCollection = false } = {}) {
  const max = plan.limits.maxCollectionsWithSort;
  if (singleCollection) return targets.slice(0, 1);

  if (targets.length <= max) {
    return { targets, truncated: 0, max };
  }

  return {
    targets: targets.slice(0, max),
    truncated: targets.length - max,
    max,
  };
}

export function assertOrdersBudget(plan, usage, additionalOrders = 0) {
  const limit = plan.limits.maxOrdersPerMonth;
  if (usage.ordersScanned + additionalOrders > limit) {
    throw new PlanError(
      `Monthly order limit reached (${limit}) for sales-based sort`,
      "PLAN_LIMIT",
      plan.id === "free" ? "growth" : "pro",
    );
  }
}

export function planUsageSummary(plan, usage, collectionsInScope = 0) {
  return {
    planId: plan.id,
    planName: plan.name,
    limits: plan.limits,
    features: plan.features,
    usage,
    meters: {
      collections: {
        used: usage.collectionsSorted,
        limit: plan.limits.maxCollectionsWithSort,
        inScope: collectionsInScope,
      },
      collectionRules: {
        limit: plan.limits.maxCollectionRuleOverrides,
      },
      orders: {
        used: usage.ordersScanned,
        limit: plan.limits.maxOrdersPerMonth,
      },
    },
  };
}

export { clampCollectionRules };
