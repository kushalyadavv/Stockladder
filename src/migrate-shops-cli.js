import "./load-env.js";
import {
  archiveLegacyGlobalData,
  migrateAllKnownShops,
} from "./shop-migrate.js";
import { listInstalledShops } from "./shop-store.js";

const results = migrateAllKnownShops();
const archive = archiveLegacyGlobalData();
const installed = listInstalledShops();

console.log("\n=== Stockladder shop data migration ===\n");
console.log(JSON.stringify({ results, archive, installed: installed.length }, null, 2));
console.log("\nInstalled shops:");
for (const shop of installed) {
  console.log(`  - ${shop.shop} (${shop.planId})`);
}
