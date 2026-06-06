import { sortCollection, fetchCollectionProducts } from "./sort.js";

const COLLECTION_BY_HANDLE = `query($h: String!) {
  collectionByHandle(handle: $h) {
    id handle title sortOrder
  }
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

async function ensureTargetCollection(client, mirror, source, dryRun) {
  const targetHandle = mirror.targetHandle || `${source.handle}-sorted`;

  let target = (
    await client.graphql(COLLECTION_BY_HANDLE, { h: targetHandle })
  ).collectionByHandle;

  if (target) return target;

  if (dryRun) {
    return {
      id: null,
      handle: targetHandle,
      title: mirror.targetTitle || `${source.title} (Sorted)`,
      sortOrder: "MANUAL",
    };
  }

  const data = await client.graphql(COLLECTION_CREATE, {
    input: {
      handle: targetHandle,
      title: mirror.targetTitle || `${source.title} (Sorted)`,
      sortOrder: "MANUAL",
    },
  });
  const errors = data.collectionCreate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
  return data.collectionCreate.collection;
}

export async function syncSmartMirror(
  client,
  mirror,
  sortConfig,
  dryRun = false,
) {
  const source = (
    await client.graphql(COLLECTION_BY_HANDLE, {
      h: mirror.sourceHandle,
    })
  ).collectionByHandle;

  if (!source) {
    throw new Error(`Source collection not found: ${mirror.sourceHandle}`);
  }

  const sourceProducts = await fetchCollectionProducts(client, source.id);
  const sourceIds = sourceProducts.map((p) => p.id);

  if (!sourceIds.length) {
    return { skipped: true, reason: "empty_source", source: mirror.sourceHandle };
  }

  const target = await ensureTargetCollection(client, mirror, source, dryRun);
  const existing = target.id
    ? await fetchCollectionProducts(client, target.id)
    : [];
  const existingIds = existing.map((p) => p.id);

  const toAdd = sourceIds.filter((id) => !existingIds.includes(id));
  const toRemove = existingIds.filter((id) => !sourceIds.includes(id));

  if (dryRun) {
    return {
      skipped: false,
      source: source.handle,
      target: target.handle,
      membershipChanges: toAdd.length + toRemove.length,
      wouldSort: mirror.applySort !== false,
      productCount: sourceIds.length,
    };
  }

  if (toRemove.length) {
    const data = await client.graphql(COLLECTION_REMOVE, {
      id: target.id,
      productIds: toRemove,
    });
    const errors = data.collectionRemoveProducts?.userErrors ?? [];
    if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
    const job = data.collectionRemoveProducts?.job;
    if (job?.id && !job.done) await client.waitForJob(job.id);
  }

  if (toAdd.length) {
    const data = await client.graphql(COLLECTION_ADD, {
      id: target.id,
      productIds: toAdd,
    });
    const errors = data.collectionAddProducts?.userErrors ?? [];
    if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
  }

  let sortResult = null;
  if (mirror.applySort !== false) {
    sortResult = await sortCollection(client, target, sortConfig, false);
  }

  return {
    skipped: false,
    source: source.handle,
    target: target.handle,
    added: toAdd.length,
    removed: toRemove.length,
    productCount: sourceIds.length,
    sortResult,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncAllSmartMirrors(
  client,
  config,
  sortConfig,
  dryRun = false,
) {
  const mirrors = config.smartCollectionMirrors ?? [];
  const results = [];

  for (const mirror of mirrors) {
    results.push(await syncSmartMirror(client, mirror, sortConfig, dryRun));
  }

  return results;
}
