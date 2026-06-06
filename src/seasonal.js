import { fetchProductSalesMetrics } from "./sales.js";
import { sortCollection, fetchAllCollections } from "./sort.js";

const COLLECTION_BY_HANDLE = `query($h: String!) {
  collectionByHandle(handle: $h) { id handle title sortOrder }
}`;

const COLLECTION_CREATE = `mutation CollectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id handle title sortOrder }
    userErrors { field message }
  }
}`;

const COLLECTION_ADD = `mutation CollectionAdd($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection { id }
    userErrors { message }
  }
}`;

const COLLECTION_REMOVE = `mutation CollectionRemove($id: ID!, $productIds: [ID!]!) {
  collectionRemoveProducts(id: $id, productIds: $productIds) {
    job { id done }
    userErrors { message }
  }
}`;

export async function syncSeasonalCollection(
  client,
  spec,
  sortConfig,
  dryRun = false,
) {
  const {
    handle,
    title,
    days = 30,
    limit = 20,
    sourceCollectionHandle = "",
    applySort = true,
  } = spec;

  const sales = await fetchProductSalesMetrics(client, days);
  if (sales.accessDenied) {
    throw new Error(sales.message);
  }
  let candidateIds = [...sales.metrics.entries()]
    .sort((a, b) => b[1].units - a[1].units)
    .map(([id]) => id);

  if (sourceCollectionHandle) {
    const collections = await fetchAllCollections(client);
    const source = collections.find((c) => c.handle === sourceCollectionHandle);
    if (!source) {
      throw new Error(`Source collection not found: ${sourceCollectionHandle}`);
    }
    const { fetchCollectionProducts } = await import("./sort.js");
    const sourceProducts = await fetchCollectionProducts(client, source.id);
    const allowed = new Set(sourceProducts.map((p) => p.id));
    candidateIds = candidateIds.filter((id) => allowed.has(id));
  }

  const topIds = candidateIds.slice(0, limit);
  if (!topIds.length) {
    return { skipped: true, reason: "no_sales_data", added: 0, removed: 0 };
  }

  let collection = (
    await client.graphql(COLLECTION_BY_HANDLE, { h: handle })
  ).collectionByHandle;

  if (!collection) {
    if (dryRun) {
      return {
        skipped: false,
        created: true,
        productCount: topIds.length,
        added: topIds.length,
        removed: 0,
      };
    }

    const data = await client.graphql(COLLECTION_CREATE, {
      input: {
        handle,
        title: title || handle,
        sortOrder: "MANUAL",
      },
    });
    const errors = data.collectionCreate?.userErrors ?? [];
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join(", "));
    }
    collection = data.collectionCreate.collection;
  }

  const { fetchCollectionProducts } = await import("./sort.js");
  const existing = await fetchCollectionProducts(client, collection.id);
  const existingIds = existing.map((p) => p.id);

  const toAdd = topIds.filter((id) => !existingIds.includes(id));
  const toRemove = existingIds.filter((id) => !topIds.includes(id));

  if (dryRun) {
    return {
      skipped: false,
      handle,
      productCount: topIds.length,
      added: toAdd.length,
      removed: toRemove.length,
      wouldSort: applySort,
    };
  }

  if (toRemove.length) {
    const data = await client.graphql(COLLECTION_REMOVE, {
      id: collection.id,
      productIds: toRemove,
    });
    const errors = data.collectionRemoveProducts?.userErrors ?? [];
    if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
    const job = data.collectionRemoveProducts?.job;
    if (job?.id && !job.done) await client.waitForJob(job.id);
  }

  if (toAdd.length) {
    const data = await client.graphql(COLLECTION_ADD, {
      id: collection.id,
      productIds: toAdd,
    });
    const errors = data.collectionAddProducts?.userErrors ?? [];
    if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
  }

  let sortResult = null;
  if (applySort) {
    sortResult = await sortCollection(client, collection, sortConfig, false);
  }

  return {
    skipped: false,
    handle,
    title: collection.title,
    productCount: topIds.length,
    added: toAdd.length,
    removed: toRemove.length,
    sortResult,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncAllSeasonalCollections(
  client,
  config,
  sortConfig,
  dryRun = false,
) {
  const specs = (config.seasonalCollections ?? []).filter((s) => s.enabled !== false);
  const results = [];

  for (const spec of specs) {
    results.push(
      await syncSeasonalCollection(client, spec, sortConfig, dryRun),
    );
  }

  return results;
}
