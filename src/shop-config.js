import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, normalizeConfig } from "./config.js";
import { shopDir, shopFileFor } from "./shop-data-path.js";
import { ensureShopMigrated } from "./shop-migrate.js";
import { resolveShop } from "./shop-store.js";

const ROOT_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "config.json",
);

function configPath(shop) {
  return shopFileFor(shop, "config.json");
}

function readGlobalConfig() {
  if (!existsSync(ROOT_CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  return {
    ...DEFAULT_CONFIG,
    ...JSON.parse(readFileSync(ROOT_CONFIG_PATH, "utf8")),
  };
}

export function loadShopConfig(shop = "") {
  const resolved = shop || resolveShop();
  ensureShopMigrated(resolved);

  const path = configPath(resolved);
  if (!existsSync(path)) {
    const migrated = readGlobalConfig();
    saveShopConfig(migrated, resolved);
    return migrated;
  }

  return normalizeConfig({
    ...DEFAULT_CONFIG,
    ...JSON.parse(readFileSync(path, "utf8")),
  });
}

export function saveShopConfig(config, shop = "") {
  const resolved = shop || resolveShop();
  ensureShopMigrated(resolved);
  shopDir(resolved);

  const merged = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  writeFileSync(configPath(resolved), `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

export function deleteShopConfig(shop) {
  const path = configPath(shop);
  if (existsSync(path)) {
    writeFileSync(path, "{}\n");
  }
}
