import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { normalizeShop } from "./auth.js";
import {
  legacyShopRecordPath,
  shopDir,
  shopSafeName,
  SHOPS_ROOT,
} from "./shop-data-path.js";

export function handleAppUninstalled(shop) {
  const normalized = normalizeShop(shop);
  const safe = shopSafeName(normalized);

  const removed = [];

  try {
    const dir = join(SHOPS_ROOT, safe);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    }
  } catch (err) {
    console.warn(
      `[uninstall] could not remove shop dir for ${normalized}:`,
      err.message,
    );
  }

  const legacy = legacyShopRecordPath(normalized);
  if (existsSync(legacy)) {
    rmSync(legacy, { force: true });
    removed.push(legacy);
  }

  return {
    handled: true,
    shop: normalized,
    removed,
  };
}
