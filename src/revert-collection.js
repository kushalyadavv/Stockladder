import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env.js";
import { resolveAccessToken } from "./auth.js";
import { createShopifyClient } from "./shopify.js";
import {
  applyMoves,
  buildMoves,
  ensureManualSort,
  fetchCollectionProducts,
} from "./sort.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const handle = process.argv[2] ?? "shop-all-products";
const snapshotPath =
  process.argv[3] ??
  join(__dirname, "..", "snapshots", `${handle}-original-top.json`);

const PRODUCTS_QUERY = `query CollectionProductsDetailed($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    id
    title
    handle
    sortOrder
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

async function fetchProductsDetailed(client, collectionId) {
  const items = [];
  let cursor = null;

  do {
    const data = await client.graphql(PRODUCTS_QUERY, {
      id: collectionId,
      first: 100,
      after: cursor,
    });
    const conn = data.collection.products;
    items.push(...conn.edges.map((e) => e.node));
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  return items;
}

function buildRestoredOrder(products, priorityTitles) {
  const used = new Set();
  const front = [];

  for (const title of priorityTitles) {
    const match = products.find((p) => p.title === title && !used.has(p.id));
    if (match) {
      front.push(match.id);
      used.add(match.id);
    }
  }

  const rest = products
    .filter((p) => !used.has(p.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((p) => p.id);

  return [...front, ...rest];
}

async function main() {
  const store = process.env.SHOPIFY_STORE?.trim();
  if (!store) throw new Error("SHOPIFY_STORE missing");

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const token = await resolveAccessToken(store);
  const client = createShopifyClient({ store, accessToken: token });

  const { collectionByHandle } = await client.graphql(
    `query($h: String!) { collectionByHandle(handle: $h) { id title handle sortOrder } }`,
    { h: handle },
  );

  const collection = collectionByHandle;
  if (!collection) {
    throw new Error(`Collection not found: ${handle}`);
  }

  console.log(`Reverting: ${collection.title} (${handle})`);
  console.log(`Snapshot: ${snapshotPath}`);
  console.log(`Priority products at top: ${snapshot.titles.length}\n`);

  const products = await fetchProductsDetailed(client, collection.id);
  const currentIds = products.map((p) => p.id);
  const desiredIds = buildRestoredOrder(products, snapshot.titles);

  await ensureManualSort(
    client,
    collection,
    { forceManualSort: true },
    false,
  );

  const moves = buildMoves(currentIds, desiredIds);
  console.log(`Applying ${moves.length} move(s)…`);

  const applied = await applyMoves(
    client,
    collection.id,
    moves,
    false,
    collection.title,
  );

  console.log(`Done. Restored ${applied} move(s) across ${products.length} products.`);
  console.log("\nTop of collection now:");
  for (const title of snapshot.titles.slice(0, 8)) {
    console.log(`  • ${title}`);
  }
  console.log(
    "\nNote: Only the captured top products are guaranteed exact. Remaining products use newest-first order.",
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
