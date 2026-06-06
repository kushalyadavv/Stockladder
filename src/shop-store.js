import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { normalizeShop } from "./auth.js";
import { getPlan, PLAN_IDS } from "./plans.js";
import { getCurrentShop } from "./request-context.js";
import {
  legacyShopRecordPath,
  shopDir,
  shopRecordPath,
  SHOPS_ROOT,
  shopSafeName,
} from "./shop-data-path.js";
import { ensureShopMigrated } from "./shop-migrate.js";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function defaultUsage() {
  return {
    month: currentMonth(),
    sortsRun: 0,
    collectionsSorted: 0,
    ordersScanned: 0,
  };
}

function defaultShop(shop) {
  return {
    shop: normalizeShop(shop),
    accessToken: null,
    refreshToken: null,
    scope: null,
    tokenExpiresAt: null,
    installedAt: null,
    uninstalledAt: null,
    planId: "free",
    subscriptionId: null,
    subscriptionStatus: null,
    trialEndsAt: null,
    usage: defaultUsage(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeUsage(usage) {
  const month = currentMonth();
  if (!usage || usage.month !== month) {
    return defaultUsage();
  }
  return {
    month,
    sortsRun: usage.sortsRun ?? 0,
    collectionsSorted: usage.collectionsSorted ?? 0,
    ordersScanned: usage.ordersScanned ?? 0,
  };
}

function readShopRecordFile(path, shop) {
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  const record = JSON.parse(readFileSync(path, "utf8"));
  record.shop = normalizeShop(record.shop || shop);
  record.usage = normalizeUsage(record.usage);
  return record;
}

export function resolveShop(shopOverride = "") {
  const fromContext = getCurrentShop();
  if (fromContext) return fromContext;

  if (shopOverride) {
    return normalizeShop(shopOverride);
  }

  const fromEnv = process.env.SHOPIFY_STORE?.trim();
  if (fromEnv) {
    return normalizeShop(fromEnv);
  }

  throw new Error(
    "Shop context missing — install the app or set SHOPIFY_STORE for CLI",
  );
}

export function isShopInstalled(shop) {
  const record = getShopRecord(shop);
  return Boolean(record.accessToken) && !record.uninstalledAt;
}

export function saveShopAuth(shop, tokens) {
  const record = getShopRecord(shop);
  record.accessToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) {
    record.refreshToken = tokens.refreshToken;
  }
  if (tokens.scope !== undefined) {
    record.scope = tokens.scope;
  }
  if (tokens.expiresIn) {
    record.tokenExpiresAt = new Date(
      Date.now() + tokens.expiresIn * 1000,
    ).toISOString();
  }
  record.installedAt = record.installedAt ?? new Date().toISOString();
  record.uninstalledAt = null;
  return saveShopRecord(record);
}

export function clearShopAuth(shop) {
  const record = getShopRecord(shop);
  record.accessToken = null;
  record.refreshToken = null;
  record.scope = null;
  record.tokenExpiresAt = null;
  record.uninstalledAt = new Date().toISOString();
  return saveShopRecord(record);
}

export function getShopRecord(shop) {
  const normalized = normalizeShop(shop);
  ensureShopMigrated(normalized);

  const modernPath = shopRecordPath(normalized);
  const legacyPath = legacyShopRecordPath(normalized);

  const existing =
    readShopRecordFile(modernPath, normalized) ||
    readShopRecordFile(legacyPath, normalized);

  if (existing) {
    return existing;
  }

  const record = defaultShop(normalized);
  saveShopRecord(record);
  return record;
}

export function saveShopRecord(record) {
  const normalized = normalizeShop(record.shop);
  ensureShopMigrated(normalized);
  shopDir(normalized);

  record.shop = normalized;
  record.updatedAt = new Date().toISOString();
  record.usage = normalizeUsage(record.usage);
  writeFileSync(
    shopRecordPath(normalized),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

export function setShopPlan(shop, planId, extra = {}) {
  if (!PLAN_IDS.includes(planId)) {
    throw new Error(`Unknown plan: ${planId}`);
  }
  const record = getShopRecord(shop);
  record.planId = planId;
  if (extra.subscriptionId !== undefined) {
    record.subscriptionId = extra.subscriptionId;
  }
  if (extra.subscriptionStatus !== undefined) {
    record.subscriptionStatus = extra.subscriptionStatus;
  }
  if (extra.trialEndsAt !== undefined) {
    record.trialEndsAt = extra.trialEndsAt;
  }
  return saveShopRecord(record);
}

export function recordShopUsage(shop, patch) {
  const record = getShopRecord(shop);
  record.usage = normalizeUsage(record.usage);
  if (patch.sortsRun) record.usage.sortsRun += patch.sortsRun;
  if (patch.collectionsSorted) {
    record.usage.collectionsSorted += patch.collectionsSorted;
  }
  if (patch.ordersScanned) {
    record.usage.ordersScanned += patch.ordersScanned;
  }
  return saveShopRecord(record);
}

export function getPlanContext(shopOverride = "") {
  const shop = resolveShop(shopOverride);
  const record = getShopRecord(shop);
  const plan = getPlan(record.planId);
  return { shop, record, plan, usage: record.usage };
}

export function listInstalledShops() {
  mkdirSync(SHOPS_ROOT, { recursive: true });
  const shops = new Map();

  for (const entry of readdirSync(SHOPS_ROOT)) {
    const full = join(SHOPS_ROOT, entry);
    const meta = statSync(full);

    if (meta.isFile() && entry.endsWith(".json") && !entry.endsWith(".bak")) {
      const record = readShopRecordFile(full, entry.replace(/\.json$/, ""));
      if (record?.shop && record.accessToken && !record.uninstalledAt) {
        shops.set(record.shop, record);
      }
      continue;
    }

    if (!meta.isDirectory()) continue;
    if (!existsSync(join(full, "shop.json"))) continue;

    const record = readShopRecordFile(join(full, "shop.json"), entry);
    if (record?.shop && record.accessToken && !record.uninstalledAt) {
      shops.set(record.shop, record);
    }
  }

  return [...shops.values()];
}
