import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_SORT_RULE_STACK } from "./collection-config.js";
import { getCurrentShop } from "./request-context.js";
import { clampSalesLookbackDays } from "./sales.js";
import { loadShopConfig, saveShopConfig } from "./shop-config.js";
import { resolveShop } from "./shop-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "config.json");

export const DEFAULT_CONFIG = {
  forceManualSort: true,
  includeHandles: [],
  excludeHandles: [],
  includeIds: [],
  excludeIds: [],
  deprioritizeCollectionHandles: [],
  untrackedPosition: "top",
  sortDirection: "desc",
  minMovesBeforeReorder: 1,
  sortStrategy: "inventory_full",
  withinTierSort: undefined,
  outOfStockAction: "push_down",
  useOnlineInventory: false,
  pinTags: ["featured", "pin-top"],
  promoteTags: [],
  demoteTags: [],
  promoteVendors: [],
  demoteVendors: [],
  lowStockThreshold: 5,
  sortRuleStack: DEFAULT_SORT_RULE_STACK,
  collectionRules: {},
  sortVariantsByInventory: false,
  salesLookbackDays: 30,
  ga4PropertyId: "",
  abTests: [],
  seasonalCollections: [],
  smartCollectionMirrors: [],
  webhookDebounceMs: 90000,
};

function activeShop() {
  return getCurrentShop() || process.env.SHOPIFY_STORE?.trim() || "";
}

export function normalizeConfig(config) {
  return {
    ...config,
    salesLookbackDays: clampSalesLookbackDays(config.salesLookbackDays),
  };
}

export function loadConfig() {
  const shop = activeShop();
  if (shop) {
    return loadShopConfig(shop);
  }

  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = readFileSync(CONFIG_PATH, "utf8");
  return normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
}

export function saveConfig(config) {
  const shop = activeShop();
  const normalized = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  if (shop) {
    return saveShopConfig(normalized, shop);
  }

  writeFileSync(CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function shouldProcessCollection(collection, config) {
  const { handle, id } = collection;

  if (config.excludeIds?.length && config.excludeIds.includes(id)) {
    return false;
  }
  if (config.excludeHandles?.length && config.excludeHandles.includes(handle)) {
    return false;
  }

  const hasIncludeList =
    (config.includeIds?.length ?? 0) > 0 ||
    (config.includeHandles?.length ?? 0) > 0;

  if (!hasIncludeList) {
    return true;
  }

  if (config.includeIds?.includes(id)) {
    return true;
  }
  if (config.includeHandles?.includes(handle)) {
    return true;
  }

  return false;
}
