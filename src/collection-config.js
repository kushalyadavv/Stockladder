export const RULE_CATALOG = {
  pinned: "Pinned product tags",
  promoted_tags: "Promoted tags",
  promoted_vendors: "Promoted vendors",
  untracked: "Untracked inventory",
  in_stock_high: "In stock (above low-stock threshold)",
  low_stock: "Low stock band",
  in_stock_default: "Other in-stock",
  demoted_tags: "Demoted tags",
  demoted_vendors: "Demoted vendors",
  deprioritized: "Deprioritized collections",
  out_of_stock: "Out of stock",
};

export const DEFAULT_SORT_RULE_STACK = [
  "pinned",
  "promoted_tags",
  "promoted_vendors",
  "untracked",
  "in_stock_high",
  "low_stock",
  "in_stock_default",
  "demoted_tags",
  "demoted_vendors",
  "deprioritized",
  "out_of_stock",
];

export function resolveConfigForCollection(globalConfig, handle) {
  const base = { ...globalConfig };
  const override = globalConfig.collectionRules?.[handle];
  if (!override) return base;

  if (override.skip === true) {
    return { ...base, _skipCollection: true, _skipReason: "collection_rule_skip" };
  }

  const merged = {
    ...base,
    ...override,
    collectionRules: globalConfig.collectionRules,
    sortRuleStack: override.sortRuleStack ?? base.sortRuleStack,
  };

  return merged;
}

export function getEffectiveRuleStack(config) {
  const stack = config.sortRuleStack ?? DEFAULT_SORT_RULE_STACK;
  const known = new Set(Object.keys(RULE_CATALOG));
  return stack.filter((r) => known.has(r));
}

export function emptyCollectionRule() {
  return {
    skip: false,
    sortStrategy: undefined,
    withinTierSort: undefined,
    outOfStockAction: undefined,
    lowStockThreshold: undefined,
  };
}
