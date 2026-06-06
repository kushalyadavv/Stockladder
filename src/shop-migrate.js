import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { normalizeShop } from "./auth.js";
import {
  DATA_ROOT,
  SHOPS_ROOT,
  globalDataPath,
  legacyShopRecordPath,
  shopDir,
  shopFileFor,
  shopRecordPath,
  shopSafeName,
} from "./shop-data-path.js";

const migrated = new Set();

const GLOBAL_FILES = [
  { name: "analytics.json", dest: "analytics.json" },
  { name: "ga4-metrics.json", dest: "ga4-metrics.json" },
  { name: "runs.json", dest: "runs.json" },
];

function markMigrated(shop) {
  migrated.add(shopSafeName(shop));
}

export function wasShopMigrated(shop) {
  return migrated.has(shopSafeName(shop));
}

function copyIfMissing(src, dest) {
  if (!existsSync(src) || existsSync(dest)) return false;
  mkdirSync(join(dest, ".."), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function migrateShopRecord(shop) {
  const normalized = normalizeShop(shop);
  const legacy = legacyShopRecordPath(normalized);
  const modern = shopRecordPath(normalized);

  if (existsSync(legacy) && statSync(legacy).isFile()) {
    mkdirSync(shopDir(normalized), { recursive: true });
    if (!existsSync(modern)) {
      copyFileSync(legacy, modern);
    }
    renameSync(legacy, `${legacy}.bak`);
    return true;
  }

  return false;
}

function migrateRootConfig(shop) {
  const rootConfig = join(DATA_ROOT, "..", "config.json");
  const dest = shopFileFor(shop, "config.json");
  return copyIfMissing(rootConfig, dest);
}

function migrateGlobalDataFiles(shop) {
  let moved = 0;
  for (const { name, dest } of GLOBAL_FILES) {
    if (copyIfMissing(globalDataPath(name), shopFileFor(shop, dest))) {
      moved++;
    }
  }
  return moved;
}

function migrateGlobalSnapshots(shop) {
  const legacyDir = globalDataPath("snapshots");
  const destDir = shopFileFor(shop, "snapshots");
  if (!existsSync(legacyDir)) return 0;

  const entries = readdirSync(legacyDir);
  if (entries.length === 0) return 0;

  mkdirSync(destDir, { recursive: true });
  let moved = 0;

  for (const entry of entries) {
    const src = join(legacyDir, entry);
    const dest = join(destDir, entry);
    if (existsSync(dest)) continue;
    if (statSync(src).isFile()) {
      copyFileSync(src, dest);
      moved++;
    }
  }

  return moved;
}

function writeMigrationMarker(shop, details) {
  const markerPath = shopFileFor(shop, ".migrated.json");
  const payload = {
    shop: normalizeShop(shop),
    migratedAt: new Date().toISOString(),
    ...details,
  };
  writeFileSync(markerPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function ensureShopMigrated(shop) {
  const normalized = normalizeShop(shop);
  if (wasShopMigrated(normalized)) return { shop: normalized, skipped: true };

  const details = {
    shopRecord: migrateShopRecord(normalized),
    config: migrateRootConfig(normalized),
    dataFiles: migrateGlobalDataFiles(normalized),
    snapshots: migrateGlobalSnapshots(normalized),
  };

  writeMigrationMarker(normalized, details);
  markMigrated(normalized);

  const any =
    details.shopRecord ||
    details.config ||
    details.dataFiles > 0 ||
    details.snapshots > 0;

  if (any) {
    console.log(
      `[migrate] ${normalized}: shop=${details.shopRecord} config=${details.config} files=${details.dataFiles} snapshots=${details.snapshots}`,
    );
  }

  return { shop: normalized, skipped: false, ...details };
}

export function migrateAllKnownShops() {
  mkdirSync(SHOPS_ROOT, { recursive: true });
  cleanupMistakenShopEntries();
  const shops = new Set();

  const envShop = process.env.SHOPIFY_STORE?.trim();
  if (envShop) shops.add(normalizeShop(envShop));

  for (const entry of readdirSync(SHOPS_ROOT)) {
    const full = join(SHOPS_ROOT, entry);
    if (entry.endsWith(".json")) {
      try {
        const record = JSON.parse(readFileSync(full, "utf8"));
        if (record.shop) shops.add(normalizeShop(record.shop));
      } catch {
        /* ignore */
      }
      continue;
    }

    if (!statSync(full).isDirectory()) continue;

    const shopJson = join(full, "shop.json");
    if (existsSync(shopJson)) {
      try {
        const record = JSON.parse(readFileSync(shopJson, "utf8"));
        if (record.shop) shops.add(normalizeShop(record.shop));
      } catch {
        /* ignore */
      }
    }
  }

  return [...shops].map((shop) => ensureShopMigrated(shop));
}

function cleanupMistakenShopEntries() {
  if (!existsSync(SHOPS_ROOT)) return 0;

  let removed = 0;
  for (const entry of readdirSync(SHOPS_ROOT)) {
    const full = join(SHOPS_ROOT, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, "shop.json"))) continue;

    rmSync(full, { recursive: true, force: true });
    removed++;
    console.log(`[migrate] Removed mistaken shop entry: ${entry}`);
  }

  return removed;
}

export function archiveLegacyGlobalData() {
  const archiveDir = globalDataPath("_legacy_global");
  if (existsSync(archiveDir)) return archiveDir;

  mkdirSync(archiveDir, { recursive: true });
  let archived = 0;

  for (const { name } of GLOBAL_FILES) {
    const src = globalDataPath(name);
    if (!existsSync(src)) continue;
    renameSync(src, join(archiveDir, name));
    archived++;
  }

  const snapshots = globalDataPath("snapshots");
  if (existsSync(snapshots)) {
    renameSync(snapshots, join(archiveDir, "snapshots"));
    archived++;
  }

  if (archived > 0) {
    console.log(`[migrate] Archived ${archived} legacy global data item(s)`);
  }

  return archiveDir;
}
