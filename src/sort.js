import { computeDesiredOrder } from "./order.js";
import { buildMoves, applyMoves } from "./moves.js";
import { saveCollectionSnapshot } from "./snapshots.js";
import { sortVariantsForProducts } from "./variants.js";
import { enrichSortConfig } from "./sort-context.js";
import { recordSortAnalytics } from "./analytics.js";

const COLLECTIONS_QUERY = `query Collections($first: Int!, $after: String) {
  collections(first: $first, after: $after) {
    edges {
      node { id handle title sortOrder }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const COLLECTION_PRODUCTS_QUERY = `query CollectionProducts($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    id title sortOrder
    products(first: $first, after: $after) {
      edges {
        node {
          id
          handle
          title
          tags
          vendor
          createdAt
          totalInventory
          tracksInventory
          variants(first: 50) {
            edges {
              node {
                id
                title
                position
                sellableOnlineQuantity
                inventoryQuantity
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const COLLECTION_BESTSELLING_QUERY = `query BestSelling($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    products(first: $first, after: $after, sortKey: BEST_SELLING) {
      edges { node { id } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const COLLECTION_UPDATE = `mutation CollectionUpdate($input: CollectionInput!) {
  collectionUpdate(input: $input) {
    collection { id sortOrder }
    userErrors { field message }
  }
}`;

const COLLECTION_REMOVE = `mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
  collectionRemoveProducts(id: $id, productIds: $productIds) {
    job { id done }
    userErrors { message }
  }
}`;

function normalizeProduct(node) {
  return {
    ...node,
    tags: node.tags ?? [],
    variants: (node.variants?.edges ?? []).map((e) => e.node),
  };
}

export async function fetchAllCollections(client) {
  return client.paginate(
    COLLECTIONS_QUERY,
    (data) => {
      const conn = data.collections;
      return {
        nodes: conn.edges.map((e) => e.node),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
    { first: 50 },
  );
}

export async function fetchCollectionProducts(client, collectionId) {
  const products = await client.paginate(
    COLLECTION_PRODUCTS_QUERY,
    (data) => {
      const coll = data.collection;
      if (!coll) {
        return { nodes: [], hasNextPage: false, endCursor: null };
      }
      const conn = coll.products;
      return {
        nodes: conn.edges.map((e) => normalizeProduct(e.node)),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
    { id: collectionId, first: 100 },
  );
  return products;
}

export async function fetchBestsellerRank(client, collectionId) {
  const ids = await client.paginate(
    COLLECTION_BESTSELLING_QUERY,
    (data) => {
      const conn = data.collection.products;
      return {
        nodes: conn.edges.map((e) => e.node.id),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
    { id: collectionId, first: 100 },
  );
  return new Map(ids.map((id, i) => [id, i]));
}

export async function loadDeprioritizedProductIds(client, collections, handles) {
  const ids = new Set();
  if (!handles?.length) return ids;

  const byHandle = new Map(collections.map((c) => [c.handle, c]));

  for (const handle of handles) {
    const collection = byHandle.get(handle);
    if (!collection) {
      console.warn(`  ⚠ deprioritize collection not found: ${handle}`);
      continue;
    }
    const products = await fetchCollectionProducts(client, collection.id);
    for (const p of products) ids.add(p.id);
  }

  return ids;
}

export { computeDesiredOrder } from "./order.js";
export { buildMoves, applyMoves } from "./moves.js";

export async function ensureManualSort(client, collection, config, dryRun) {
  if (collection.sortOrder === "MANUAL") return collection;

  if (!config.forceManualSort) {
    throw new Error(
      `Collection "${collection.title}" sortOrder is ${collection.sortOrder}, not MANUAL.`,
    );
  }

  if (dryRun) {
    console.log(`  [dry-run] Would set "${collection.title}" sortOrder → MANUAL`);
    return { ...collection, sortOrder: "MANUAL" };
  }

  const data = await client.graphql(COLLECTION_UPDATE, {
    input: { id: collection.id, sortOrder: "MANUAL" },
  });

  const errors = data.collectionUpdate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `collectionUpdate failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  return data.collectionUpdate.collection;
}

async function hideOutOfStock(client, collectionId, productIds, dryRun, title) {
  if (!productIds.length) return 0;

  if (dryRun) {
    console.log(
      `  [dry-run] Would remove ${productIds.length} OOS product(s) from "${title}"`,
    );
    return productIds.length;
  }

  const data = await client.graphql(COLLECTION_REMOVE, {
    id: collectionId,
    productIds,
  });
  const errors = data.collectionRemoveProducts?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }
  const job = data.collectionRemoveProducts?.job;
  if (job?.id && !job.done) await client.waitForJob(job.id);
  return productIds.length;
}

export async function sortCollection(
  client,
  collection,
  config,
  dryRun,
  planContext = null,
) {
  const products = await fetchCollectionProducts(client, collection.id);

  if (products.length === 0) {
    return { skipped: true, reason: "empty", moves: 0 };
  }

  if (!dryRun) {
    saveCollectionSnapshot(collection, products.map((p) => p.id));
    console.log(`  Snapshot saved (${products.length} products)`);
  }

  const sortConfig = await enrichSortConfig(
    client,
    collection,
    config,
    planContext,
  );

  const updated = await ensureManualSort(client, collection, config, dryRun);

  if (updated.sortOrder !== "MANUAL" && !dryRun) {
    return { skipped: true, reason: "not_manual", moves: 0 };
  }

  const currentIds = products.map((p) => p.id);
  const desiredIds = computeDesiredOrder(products, sortConfig);
  const moves = buildMoves(currentIds, desiredIds);

  let applied = 0;
  if (moves.length >= (config.minMovesBeforeReorder ?? 1)) {
    applied = await applyMoves(
      client,
      collection.id,
      moves,
      dryRun,
      collection.title,
    );
  }

  let variantMoves = 0;
  if (config.sortVariantsByInventory) {
    variantMoves = await sortVariantsForProducts(
      client,
      products,
      sortConfig,
      dryRun,
    );
    if (variantMoves > 0) {
      console.log(
        `  ${dryRun ? "[dry-run] Would reorder" : "Reordered"} ${variantMoves} variant position(s)`,
      );
    }
  }

  let hidden = 0;
  if (config.outOfStockAction === "hide") {
    const desiredSet = new Set(desiredIds);
    const toHide = currentIds.filter((id) => !desiredSet.has(id));
    hidden = await hideOutOfStock(
      client,
      collection.id,
      toHide,
      dryRun,
      collection.title,
    );
  }

  if (applied === 0 && hidden === 0 && variantMoves === 0) {
    return {
      skipped: true,
      reason: "already_sorted",
      moves: 0,
      hidden: 0,
      variantMoves: 0,
    };
  }

  if (!dryRun && (applied > 0 || hidden > 0)) {
    recordSortAnalytics({
      handle: collection.handle,
      title: collection.title,
      beforeIds: currentIds,
      afterIds: desiredIds,
      moves: applied,
      strategy: sortConfig.sortStrategy,
      withinTierSort: sortConfig.withinTierSort,
      dryRun: false,
    });
  }

  return {
    skipped: false,
    moves: applied,
    hidden,
    variantMoves,
    productCount: products.length,
  };
}
