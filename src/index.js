import { runSort } from "./engine.js";
import { runWithShopAsync } from "./request-context.js";
import { migrateLegacyEnvInstall } from "./shop-auth.js";
import { migrateAllKnownShops } from "./shop-migrate.js";

migrateLegacyEnvInstall();
migrateAllKnownShops();

const dryRun =
  process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";
const collectionHandle =
  process.env.COLLECTION_HANDLE?.trim() || process.argv[2]?.trim() || "";
const shop = process.env.SHOPIFY_STORE?.trim();
if (!shop) {
  console.error("SHOPIFY_STORE missing");
  process.exit(1);
}

const { summary } = await runWithShopAsync(shop, () =>
  runSort({ dryRun, collectionHandle }),
);

if (summary.errors > 0) {
  process.exit(1);
}
