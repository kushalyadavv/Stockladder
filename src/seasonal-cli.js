import "./load-env.js";
import { loadConfig } from "./config.js";
import { migrateLegacyEnvInstall, resolveShopAccessToken } from "./shop-auth.js";
import { runWithShopAsync } from "./request-context.js";
import { createShopifyClient } from "./shopify.js";
import { loadDeprioritizedProductIds, fetchAllCollections } from "./sort.js";
import { syncAllSeasonalCollections } from "./seasonal.js";

const dryRun = process.argv.includes("--dry-run");

const store = process.env.SHOPIFY_STORE?.trim();
if (!store) {
  console.error("SHOPIFY_STORE missing");
  process.exit(1);
}

migrateLegacyEnvInstall();

await runWithShopAsync(store, async () => {
  const config = loadConfig();
  const token = await resolveShopAccessToken(store);
  const client = createShopifyClient({ store, accessToken: token });
  const collections = await fetchAllCollections(client);
  const deprioritizedProductIds = await loadDeprioritizedProductIds(
    client,
    collections,
    config.deprioritizeCollectionHandles ?? [],
  );
  const sortConfig = { ...config, deprioritizedProductIds };

  const results = await syncAllSeasonalCollections(
    client,
    config,
    sortConfig,
    dryRun,
  );

  console.log(JSON.stringify({ dryRun, results }, null, 2));
});
