import "./load-env.js";
import { loadConfig, shouldProcessCollection } from "./config.js";
import { resolveConfigForCollection } from "./collection-config.js";
import { resolveShopAccessToken } from "./shop-auth.js";
import { createShopifyClient } from "./shopify.js";
import {
  fetchAllCollections,
  loadDeprioritizedProductIds,
  sortCollection,
} from "./sort.js";
import { getPlanContext, recordShopUsage, resolveShop } from "./shop-store.js";
import {
  limitSortTargets,
  prepareConfigForPlan,
} from "./plan-guard.js";

function logLine(logs, line) {
  logs.push(line);
}

export async function runSort({
  dryRun = false,
  collectionHandle = "",
  config: configOverride = null,
  onLog = null,
} = {}) {
  const logs = [];
  const emit = (line) => {
    logLine(logs, line);
    onLog?.(line);
  };

  const shop = resolveShop();
  const { plan, usage } = getPlanContext(shop);
  const rawConfig = configOverride ?? loadConfig();
  const config = prepareConfigForPlan(rawConfig, plan);
  const planContext = { shop, plan, usage };
  const accessToken = await resolveShopAccessToken(shop);
  const client = createShopifyClient({ store: shop, accessToken });

  emit(`Store: ${shop}`);
  emit(`Plan: ${plan.name} (${plan.id})`);
  emit(`Dry run: ${dryRun}`);
  emit(`Strategy: ${config.sortStrategy ?? "inventory_full"}`);
  emit(`OOS action: ${config.outOfStockAction ?? "push_down"}`);
  if (config.lowStockThreshold > 0) {
    emit(`Low-stock band: ≤${config.lowStockThreshold} units`);
  }
  if (config.useOnlineInventory) emit("Using online sellable quantity");
  if (config.sortVariantsByInventory) emit("Sorting variant swatches by inventory");
  if (config.pinTags?.length) emit(`Pin tags: ${config.pinTags.join(", ")}`);
  if (config.promoteTags?.length) {
    emit(`Promote tags: ${config.promoteTags.join(", ")}`);
  }
  if (config.demoteTags?.length) {
    emit(`Demote tags: ${config.demoteTags.join(", ")}`);
  }
  const ruleOverrides = Object.keys(config.collectionRules ?? {}).length;
  if (ruleOverrides > 0) {
    emit(`Per-collection rules: ${ruleOverrides} override(s)`);
  }
  emit("Fetching collections…");

  const collections = await fetchAllCollections(client);
  const deprioritizeHandles = config.deprioritizeCollectionHandles ?? [];
  const deprioritizedProductIds = await loadDeprioritizedProductIds(
    client,
    collections,
    deprioritizeHandles,
  );

  if (deprioritizedProductIds.size > 0) {
    emit(
      `Deprioritizing ${deprioritizedProductIds.size} product(s) from: ${deprioritizeHandles.join(", ")}`,
    );
  }

  const sortConfig = { ...config, deprioritizedProductIds };

  let targets = collections.filter((c) =>
    shouldProcessCollection(c, config),
  );

  if (collectionHandle) {
    targets = targets.filter((c) => c.handle === collectionHandle);
    if (targets.length === 0) {
      throw new Error(`No collection found with handle: ${collectionHandle}`);
    }
    emit(`Filtering to collection: ${collectionHandle}`);
  }

  const limited = limitSortTargets(targets, plan, {
    singleCollection: Boolean(collectionHandle),
  });
  targets = limited.targets;

  if (limited.truncated > 0) {
    emit(
      `Plan limit: sorting ${limited.max} of ${limited.max + limited.truncated} eligible collection(s)`,
    );
  }

  emit(`Processing ${targets.length} of ${collections.length} collection(s)…`);

  const summary = {
    processed: 0,
    reordered: 0,
    skipped: 0,
    errors: 0,
    totalMoves: 0,
    dryRun,
    collectionHandle: collectionHandle || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    details: [],
  };

  for (const collection of targets) {
    const detail = {
      title: collection.title,
      handle: collection.handle,
      status: "ok",
      moves: 0,
      productCount: 0,
      message: "",
    };

    try {
      emit(`→ ${collection.title} (${collection.handle})`);
      const collConfig = resolveConfigForCollection(
        sortConfig,
        collection.handle,
      );

      if (collConfig._skipCollection) {
        summary.skipped++;
        detail.status = "skipped";
        detail.message = collConfig._skipReason;
        emit(`  Skipped (per-collection rule: skip)`);
        summary.processed++;
        summary.details.push(detail);
        continue;
      }

      const result = await sortCollection(
        client,
        collection,
        collConfig,
        dryRun,
        planContext,
      );

      if (result.skipped) {
        summary.skipped++;
        detail.status = "skipped";
        detail.message = result.reason;
        emit(`  Skipped (${result.reason})`);
      } else {
        summary.reordered++;
        summary.totalMoves += result.moves;
        detail.moves = result.moves;
        detail.hidden = result.hidden ?? 0;
        detail.variantMoves = result.variantMoves ?? 0;
        detail.productCount = result.productCount;
        const hiddenNote =
          result.hidden > 0 ? `, hid ${result.hidden} OOS` : "";
        const variantNote =
          result.variantMoves > 0
            ? `, ${result.variantMoves} variant reorder(s)`
            : "";
        emit(
          `  Reordered ${result.moves} move(s) across ${result.productCount} product(s)${hiddenNote}${variantNote}`,
        );
      }
      summary.processed++;
    } catch (err) {
      summary.errors++;
      detail.status = "error";
      detail.message = err.message;
      emit(`  Error: ${err.message}`);
    }

    summary.details.push(detail);
  }

  summary.finishedAt = new Date().toISOString();
  summary.planId = plan.id;

  if (!dryRun) {
    recordShopUsage(shop, {
      sortsRun: 1,
      collectionsSorted: summary.reordered + summary.skipped,
    });
  }

  emit("--- Summary ---");
  emit(JSON.stringify(summary, null, 2));

  return { summary, logs, planId: plan.id };
}
