import "./load-env.js";
import { loadConfig } from "./config.js";
import { migrateLegacyEnvInstall, resolveShopAccessToken } from "./shop-auth.js";
import { runWithShopAsync } from "./request-context.js";
import { createShopifyClient } from "./shopify.js";
import {
  computeDesiredOrder,
  fetchAllCollections,
  fetchBestsellerRank,
  fetchCollectionProducts,
  loadDeprioritizedProductIds,
} from "./sort.js";

const HANDLE = process.argv[2] ?? "shop-all-products";

async function main() {
  migrateLegacyEnvInstall();
  const store = process.env.SHOPIFY_STORE?.trim();
  if (!store) throw new Error("SHOPIFY_STORE missing");

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

  const { collectionByHandle } = await client.graphql(
    `query($h: String!) {
      collectionByHandle(handle: $h) {
        id title handle sortOrder
        productsCount { count }
      }
    }`,
    { h: HANDLE },
  );

  if (!collectionByHandle) {
    console.error(`Collection not found: ${HANDLE}`);
    process.exit(1);
  }

  const sortConfig = { ...config, deprioritizedProductIds };
  if (sortConfig.sortStrategy === "bestselling_then_inventory") {
    sortConfig.bestsellerRank = await fetchBestsellerRank(
      client,
      collectionByHandle.id,
    );
  }

  console.log(`Collection: ${collectionByHandle.title}`);
  console.log(`Strategy: ${config.sortStrategy}`);
  console.log(`OOS: ${config.outOfStockAction}\n`);

  const products = await fetchCollectionProducts(client, collectionByHandle.id);
  const desired = computeDesiredOrder(products, sortConfig);
  const desiredIndex = new Map(desired.map((id, i) => [id, i]));

  const movesNeeded = products.filter(
    (p, i) => desiredIndex.get(p.id) !== i,
  ).length;

  console.log(`Products needing reposition: ${movesNeeded} / ${products.length}`);
  console.log("\nPreview top 8 after sort:");
  desired.slice(0, 8).forEach((id, i) => {
    const p = products.find((x) => x.id === id);
    console.log(`  ${i + 1}. ${p?.title} (stock: ${p?.totalInventory})`);
  });
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
