import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { applyMoves, buildMoves } from "./moves.js";
import { shopFile } from "./shop-data-path.js";

function snapshotDir() {
  const dir = shopFile("snapshots");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureSnapshotDir() {
  mkdirSync(snapshotDir(), { recursive: true });
}

export function saveCollectionSnapshot(collection, productIds, meta = {}) {
  ensureSnapshotDir();
  const entry = {
    collectionId: collection.id,
    handle: collection.handle,
    title: collection.title,
    sortOrder: collection.sortOrder,
    productIds: [...productIds],
    savedAt: new Date().toISOString(),
    ...meta,
  };

  const dir = snapshotDir();
  const path = join(dir, `${collection.handle}.json`);
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);

  const manifestPath = join(dir, "_manifest.json");
  let manifest = { latestRun: null, collections: {} };
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  }
  manifest.collections[collection.handle] = {
    savedAt: entry.savedAt,
    productCount: productIds.length,
  };
  manifest.latestRun = entry.savedAt;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return entry;
}

export function loadCollectionSnapshot(handle) {
  const path = join(snapshotDir(), `${handle}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listSnapshots() {
  ensureSnapshotDir();
  const dir = snapshotDir();
  const manifestPath = join(dir, "_manifest.json");
  if (!existsSync(manifestPath)) {
    return { latestRun: null, collections: [] };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const collections = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const data = JSON.parse(
        readFileSync(join(dir, f), "utf8"),
      );
      return {
        handle: data.handle,
        title: data.title,
        productCount: data.productIds.length,
        savedAt: data.savedAt,
      };
    });
  return { latestRun: manifest.latestRun, collections };
}

const COLLECTION_ADD = `mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection { id }
    userErrors { message }
  }
}`;

const COLLECTION_REMOVE = `mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
  collectionRemoveProducts(id: $id, productIds: $productIds) {
    job { id done }
    userErrors { message }
  }
}`;

export async function revertCollection(client, handle, dryRun = false) {
  const snapshot = loadCollectionSnapshot(handle);
  if (!snapshot) {
    throw new Error(`No snapshot found for collection: ${handle}`);
  }

  const currentProducts = await client.paginate(
    `query($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        products(first: $first, after: $after) {
          edges { node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    (data) => {
      const conn = data.collection.products;
      return {
        nodes: conn.edges.map((e) => e.node.id),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
    { id: snapshot.collectionId, first: 100 },
  );

  const currentSet = new Set(currentProducts);
  const missing = snapshot.productIds.filter((id) => !currentSet.has(id));

  if (dryRun) {
    return {
      handle,
      moves: buildMoves(currentProducts, snapshot.productIds).length,
      readded: missing.length,
      dryRun: true,
    };
  }

  if (missing.length > 0) {
    const addData = await client.graphql(COLLECTION_ADD, {
      id: snapshot.collectionId,
      productIds: missing,
    });
    const addErrors = addData.collectionAddProducts?.userErrors ?? [];
    if (addErrors.length) {
      throw new Error(addErrors.map((e) => e.message).join(", "));
    }
  }

  const refreshed = await client.paginate(
    `query($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        products(first: $first, after: $after) {
          edges { node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    (data) => {
      const conn = data.collection.products;
      return {
        nodes: conn.edges.map((e) => e.node.id),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
    { id: snapshot.collectionId, first: 100 },
  );

  const moves = buildMoves(refreshed, snapshot.productIds);
  const applied = await applyMoves(
    client,
    snapshot.collectionId,
    moves,
    false,
    snapshot.title,
  );

  return { handle, moves: applied, readded: missing.length, dryRun: false };
}

export async function revertAllSnapshots(client, handles = null, dryRun = false) {
  ensureSnapshotDir();
  const targetHandles =
    handles ??
    readdirSync(snapshotDir())
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.replace(".json", ""));

  const results = [];
  for (const handle of targetHandles) {
    try {
      results.push(await revertCollection(client, handle, dryRun));
    } catch (err) {
      results.push({ handle, error: err.message });
    }
  }
  return results;
}
