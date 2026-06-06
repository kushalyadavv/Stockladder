import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeShop } from "./auth.js";
import { getCurrentShop } from "./request-context.js";

export const DATA_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

export const SHOPS_ROOT = join(DATA_ROOT, "shops");

export function shopSafeName(shop) {
  return normalizeShop(shop).replace(/[^a-z0-9.-]/gi, "_");
}

export function resolveShopArg(shop = "") {
  const resolved = shop || getCurrentShop();
  if (!resolved) {
    throw new Error("Shop context missing for data path");
  }
  return normalizeShop(resolved);
}

export function shopDir(shop = "") {
  const resolved = resolveShopArg(shop);
  const dir = join(SHOPS_ROOT, shopSafeName(resolved));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path inside the current request/CLI shop directory */
export function shopFile(...parts) {
  return join(shopDir(), ...parts);
}

/** Path inside a specific shop directory */
export function shopFileFor(shop, ...parts) {
  return join(shopDir(shop), ...parts);
}

export function legacyShopRecordPath(shop) {
  return join(SHOPS_ROOT, `${shopSafeName(shop)}.json`);
}

export function shopRecordPath(shop) {
  return shopFileFor(shop, "shop.json");
}

export function globalDataPath(...parts) {
  return join(DATA_ROOT, ...parts);
}
