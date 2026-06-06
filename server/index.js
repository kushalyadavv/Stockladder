import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/load-env.js";
import { loadConfig, saveConfig } from "../src/config.js";
import {
  RULE_CATALOG,
  resolveConfigForCollection,
} from "../src/collection-config.js";
import { classifyProductRule } from "../src/order.js";
import { runWithShopAsync } from "../src/request-context.js";
import {
  buildInstallUrl,
  completeOAuthCallback,
  embeddedAppUrl,
  migrateLegacyEnvInstall,
  resolveShopAccessToken,
} from "../src/shop-auth.js";
import { shopAuthMiddleware } from "./middleware/shop-auth.js";
import { shopFile } from "../src/shop-data-path.js";
import { handleAppUninstalled } from "../src/uninstall.js";
import {
  archiveLegacyGlobalData,
  migrateAllKnownShops,
} from "../src/shop-migrate.js";
import { createShopifyClient } from "../src/shopify.js";
import {
  fetchAllCollections,
  fetchCollectionProducts,
  computeDesiredOrder,
  loadDeprioritizedProductIds,
} from "../src/sort.js";
import { enrichSortConfig } from "../src/sort-context.js";
import {
  listAnalytics,
  getCollectionInsights,
} from "../src/analytics.js";
import {
  loadGa4Metrics,
  saveGa4Metrics,
  parseGa4Csv,
  parseGa4Rows,
} from "../src/ga4.js";
import { compareAbVariants } from "../src/ab-test.js";
import { probeOrdersAccess } from "../src/sales.js";
import { syncAllSeasonalCollections } from "../src/seasonal.js";
import { syncAllSmartMirrors } from "../src/smart-sync.js";
import { runSort } from "../src/engine.js";
import {
  listSnapshots,
  revertAllSnapshots,
  revertCollection,
} from "../src/snapshots.js";
import {
  verifyShopifyWebhook,
  handleInventoryWebhook,
} from "../src/webhooks.js";
import { getPlanContext } from "../src/shop-store.js";
import {
  assertFeature,
  planUsageSummary,
  prepareConfigForPlan,
  validateConfigForPlan,
} from "../src/plan-guard.js";
import { listPlansForDisplay } from "../src/plans.js";
import { respondWithError } from "../src/plan-errors.js";
import {
  billingTestMode,
  createPaidSubscription,
  handleSubscriptionWebhook,
  syncPlanFromShopify,
} from "../src/billing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.PORT ?? 3001);
const app = express();

migrateLegacyEnvInstall();
migrateAllKnownShops();
archiveLegacyGlobalData();

app.use(cors());

function webhookSecret() {
  return (
    process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim()
  );
}

app.post(
  "/api/webhooks/billing",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const raw = req.body.toString("utf8");
    const secret = webhookSecret();

    if (!verifyShopifyWebhook(raw, hmac, secret)) {
      return res.status(401).send("Invalid webhook signature");
    }

    try {
      const payload = JSON.parse(raw);
      const shop = req.get("X-Shopify-Shop-Domain");
      const result = handleSubscriptionWebhook(shop, payload);
      res.status(200).json(result);
    } catch (err) {
      console.error("[billing-webhook]", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

app.post(
  "/api/webhooks/inventory",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const raw = req.body.toString("utf8");
    const secret = webhookSecret();

    if (!verifyShopifyWebhook(raw, hmac, secret)) {
      return res.status(401).send("Invalid webhook signature");
    }

    try {
      const payload = JSON.parse(raw);
      const shop = req.get("X-Shopify-Shop-Domain");
      if (!shop) {
        return res.status(400).json({ error: "Missing X-Shopify-Shop-Domain" });
      }

      const result = await runWithShopAsync(shop, async () => {
        const config = loadConfig();
        return handleInventoryWebhook(
          payload,
          config,
          (line) => console.log(`[webhook] ${line}`),
        );
      });
      res.status(200).json(result);
    } catch (err) {
      console.error("[webhook]", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

app.post(
  "/api/webhooks/uninstall",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const raw = req.body.toString("utf8");
    const secret = webhookSecret();

    if (!verifyShopifyWebhook(raw, hmac, secret)) {
      return res.status(401).send("Invalid webhook signature");
    }

    try {
      const shop = req.get("X-Shopify-Shop-Domain");
      const result = handleAppUninstalled(shop);
      res.status(200).json(result);
    } catch (err) {
      console.error("[uninstall-webhook]", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

app.use(express.json());

app.get("/auth", (req, res) => {
  try {
    const shop = req.query.shop?.trim();
    if (!shop) {
      return res.status(400).send("Missing ?shop=your-store.myshopify.com");
    }
    res.redirect(buildInstallUrl(shop));
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.get("/auth/callback", async (req, res) => {
  try {
    const shop = req.query.shop?.trim();
    const code = req.query.code?.trim();
    const state = req.query.state?.trim();

    if (!shop || !code || !state) {
      return res.status(400).send("Invalid OAuth callback");
    }

    await completeOAuthCallback({ shop, code, state });
    res.redirect(embeddedAppUrl(shop));
  } catch (err) {
    console.error("[oauth]", err.message);
    res.status(500).send(err.message);
  }
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/webhooks/")) return next();
  return shopAuthMiddleware(req, res, next);
});

let sortInProgress = false;

function runsPath() {
  return shopFile("runs.json");
}

function loadRuns() {
  const path = runsPath();
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveRun(entry) {
  const path = runsPath();
  mkdirSync(join(path, ".."), { recursive: true });
  const runs = loadRuns();
  runs.unshift(entry);
  writeFileSync(path, JSON.stringify(runs.slice(0, 50), null, 2));
}

async function getClient(shop) {
  const token = await resolveShopAccessToken(shop);
  return createShopifyClient({ store: shop, accessToken: token });
}

async function buildSortContext(config, shop) {
  const client = await getClient(shop);
  const collections = await fetchAllCollections(client);
  const deprioritizedProductIds = await loadDeprioritizedProductIds(
    client,
    collections,
    config.deprioritizeCollectionHandles ?? [],
  );
  return { client, collections, sortConfig: { ...config, deprioritizedProductIds } };
}

app.get("/api/health", async (req, res) => {
  let ordersScope = { ok: null, message: null };
  let planSummary = null;

  try {
    const client = await getClient(req.shop);
    ordersScope = await probeOrdersAccess(client);
  } catch (err) {
    ordersScope = { ok: false, message: err.message };
  }

  try {
    const { plan, usage } = getPlanContext(req.shop);
    planSummary = planUsageSummary(plan, usage);
  } catch {
    planSummary = null;
  }

  res.json({
    ok: true,
    store: req.shop,
    sortInProgress,
    ordersScope,
    snapshots: listSnapshots(),
    plan: planSummary,
  });
});

app.get("/api/plan", (req, res) => {
  try {
    const { shop, record, plan, usage } = getPlanContext(req.shop);
    res.json({
      shop,
      record: {
        planId: record.planId,
        subscriptionId: record.subscriptionId,
        subscriptionStatus: record.subscriptionStatus,
      },
      ...planUsageSummary(plan, usage),
      catalog: listPlansForDisplay(),
      billingTestMode: billingTestMode(),
      devPlanSwitch: process.env.ALLOW_DEV_PLAN_SWITCH === "true",
    });
  } catch (err) {
    respondWithError(res, err);
  }
});

app.post("/api/billing/subscribe", async (req, res) => {
  try {
    const { planId = "growth" } = req.body ?? {};
    const { shop } = getPlanContext(req.shop);
    const client = await getClient(shop);
    const result = await createPaidSubscription(client, shop, planId);
    res.json(result);
  } catch (err) {
    respondWithError(res, err);
  }
});

app.get("/api/billing/callback", async (req, res) => {
  try {
    const shop = req.query.shop?.trim();
    if (shop) {
      await runWithShopAsync(shop, async () => {
        const client = await getClient(shop);
        await syncPlanFromShopify(client, shop);
      });
    }
    const redirect = process.env.PUBLIC_URL?.trim() || "/";
    res.redirect(`${redirect}?billing=confirmed`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/api/config", (_req, res) => {
  res.json(loadConfig());
});

app.get("/api/rule-catalog", (_req, res) => {
  res.json(RULE_CATALOG);
});

app.put("/api/config", (req, res) => {
  try {
    const { plan } = getPlanContext(req.shop);
    validateConfigForPlan(req.body, plan);
    const saved = saveConfig(req.body);
    res.json(saved);
  } catch (err) {
    if (respondWithError(res, err, 400)) return;
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/collections", async (req, res) => {
  try {
    const client = await getClient(req.shop);
    const collections = await fetchAllCollections(client);
    res.json(
      collections.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        sortOrder: c.sortOrder,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/snapshots", (_req, res) => {
  res.json(listSnapshots());
});

app.post("/api/revert", async (req, res) => {
  if (sortInProgress) {
    return res.status(409).json({ error: "Sort in progress — try again shortly" });
  }

  const { handle = "", dryRun = false } = req.body ?? {};
  sortInProgress = true;

  try {
    const client = await getClient(req.shop);
    const results = handle
      ? [await revertCollection(client, handle, Boolean(dryRun))]
      : await revertAllSnapshots(client, null, Boolean(dryRun));

    res.json({ dryRun: Boolean(dryRun), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sortInProgress = false;
  }
});

app.get("/api/diagnose/:handle", async (req, res) => {
  try {
    const config = loadConfig();
    const { client, sortConfig } = await buildSortContext(config, req.shop);
    const merged = resolveConfigForCollection(sortConfig, req.params.handle);

    const { collectionByHandle } = await client.graphql(
      `query($h: String!) {
        collectionByHandle(handle: $h) {
          id title handle sortOrder
          productsCount { count }
        }
      }`,
      { h: req.params.handle },
    );

    if (!collectionByHandle) {
      return res.status(404).json({ error: "Collection not found" });
    }

    if (merged._skipCollection) {
      return res.json({
        collection: collectionByHandle,
        skipped: true,
        skipReason: merged._skipReason,
        message: "This collection is set to skip in per-collection rules",
      });
    }

    const collection = {
      id: collectionByHandle.id,
      handle: collectionByHandle.handle,
      title: collectionByHandle.title,
      sortOrder: collectionByHandle.sortOrder,
    };
    const { shop, plan, usage } = getPlanContext(req.shop);
    const planContext = { shop, plan, usage };
    const enriched = await enrichSortConfig(
      client,
      collection,
      prepareConfigForPlan(merged, plan),
      planContext,
    );

    const products = await fetchCollectionProducts(
      client,
      collectionByHandle.id,
    );
    const desired = computeDesiredOrder(products, enriched);
    const desiredIndex = new Map(desired.map((id, i) => [id, i]));

    const previewTop = desired.slice(0, 12).map((id, i) => {
      const p = products.find((x) => x.id === id);
      return {
        pos: i + 1,
        title: p?.title ?? id,
        totalInventory: p?.totalInventory ?? 0,
        isDeprioritized: enriched.deprioritizedProductIds.has(id),
        isPinned: (p?.tags ?? []).some((t) =>
          (enriched.pinTags ?? []).includes(t),
        ),
        rule: p ? classifyProductRule(p, enriched) : "—",
      };
    });

    const movesNeeded = products.filter(
      (p, i) => desiredIndex.get(p.id) !== i,
    ).length;

    res.json({
      collection: collectionByHandle,
      movesNeeded,
      productCount: products.length,
      previewTop,
      strategy: enriched.sortStrategy ?? config.sortStrategy,
      withinTierSort: enriched.withinTierSort,
      salesLookbackDays: enriched.salesLookbackDays,
      ruleStack: enriched.sortRuleStack,
      collectionRuleOverride: config.collectionRules?.[req.params.handle] ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/runs", (_req, res) => {
  res.json(loadRuns());
});

app.get("/api/analytics", (req, res) => {
  const handle = req.query.handle?.trim() || "";
  if (handle) {
    return res.json(getCollectionInsights(handle));
  }
  res.json({ entries: listAnalytics() });
});

app.get("/api/ga4", (_req, res) => {
  res.json(loadGa4Metrics());
});

app.post("/api/ga4/import", (req, res) => {
  try {
    const { plan } = getPlanContext(req.shop);
    assertFeature(plan, "ga4Import", "pro");

    const { csv = "", rows = [], propertyId = "" } = req.body ?? {};
    const products = csv ? parseGa4Csv(csv) : parseGa4Rows(rows);
    const saved = saveGa4Metrics({
      propertyId: propertyId || loadConfig().ga4PropertyId,
      products,
    });
    res.json({
      imported: Object.keys(saved.products).length,
      importedAt: saved.importedAt,
    });
  } catch (err) {
    if (respondWithError(res, err, 400)) return;
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/ab/compare", async (req, res) => {
  try {
    const { shop, plan, usage } = getPlanContext(req.shop);
    assertFeature(plan, "abCompare", "pro");

    const config = loadConfig();
    const { handle, variantA = {}, variantB = {} } = req.body ?? {};
    if (!handle) return res.status(400).json({ error: "handle required" });

    const { client, sortConfig } = await buildSortContext(config, req.shop);
    const merged = resolveConfigForCollection(sortConfig, handle);

    const { collectionByHandle } = await client.graphql(
      `query($h: String!) {
        collectionByHandle(handle: $h) { id handle title sortOrder }
      }`,
      { h: handle },
    );
    if (!collectionByHandle) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const result = await compareAbVariants(
      client,
      collectionByHandle,
      variantA,
      variantB,
      prepareConfigForPlan(merged, plan),
      { shop, plan, usage },
    );
    res.json(result);
  } catch (err) {
    if (respondWithError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ab/apply", async (req, res) => {
  if (sortInProgress) {
    return res.status(409).json({ error: "A sort is already running" });
  }

  try {
    const { plan } = getPlanContext(req.shop);
    assertFeature(plan, "abCompare", "pro");
  } catch (err) {
    return respondWithError(res, err);
  }

  const { handle, variant = {}, dryRun = false } = req.body ?? {};
  if (!handle) return res.status(400).json({ error: "handle required" });

  sortInProgress = true;
  try {
    const config = loadConfig();
    const override = {
      ...(config.collectionRules?.[handle] ?? {}),
      ...variant,
    };
    const nextConfig = {
      ...config,
      collectionRules: {
        ...config.collectionRules,
        [handle]: override,
      },
    };
    saveConfig(nextConfig);

    const { summary } = await runSort({
      dryRun: Boolean(dryRun),
      collectionHandle: handle,
      config: nextConfig,
    });

    res.json({ summary, appliedVariant: variant, dryRun: Boolean(dryRun) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sortInProgress = false;
  }
});

app.post("/api/seasonal/sync", async (req, res) => {
  if (sortInProgress) {
    return res.status(409).json({ error: "A sort is already running" });
  }

  try {
    const { plan } = getPlanContext(req.shop);
    assertFeature(plan, "seasonalSync", "pro");
  } catch (err) {
    return respondWithError(res, err);
  }

  const { dryRun = false } = req.body ?? {};
  sortInProgress = true;

  try {
    const config = loadConfig();
    const client = await getClient(req.shop);
    const { sortConfig } = await buildSortContext(config, req.shop);
    const results = await syncAllSeasonalCollections(
      client,
      config,
      sortConfig,
      Boolean(dryRun),
    );
    res.json({ dryRun: Boolean(dryRun), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sortInProgress = false;
  }
});

app.post("/api/smart-sync", async (req, res) => {
  if (sortInProgress) {
    return res.status(409).json({ error: "A sort is already running" });
  }

  try {
    const { plan } = getPlanContext(req.shop);
    assertFeature(plan, "smartMirrors", "pro");
  } catch (err) {
    return respondWithError(res, err);
  }

  const { dryRun = false } = req.body ?? {};
  sortInProgress = true;

  try {
    const config = loadConfig();
    const client = await getClient(req.shop);
    const { sortConfig } = await buildSortContext(config, req.shop);
    const results = await syncAllSmartMirrors(
      client,
      config,
      sortConfig,
      Boolean(dryRun),
    );
    res.json({ dryRun: Boolean(dryRun), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sortInProgress = false;
  }
});

app.post("/api/sort", async (req, res) => {
  if (sortInProgress) {
    return res.status(409).json({ error: "A sort is already running" });
  }

  const { dryRun = false, collectionHandle = "" } = req.body ?? {};
  sortInProgress = true;
  const logs = [];

  try {
    const { summary } = await runSort({
      dryRun: Boolean(dryRun),
      collectionHandle: collectionHandle?.trim() || "",
      onLog: (line) => logs.push(line),
    });

    const entry = {
      id: Date.now(),
      dryRun: Boolean(dryRun),
      collectionHandle: collectionHandle || null,
      summary,
      logs,
      createdAt: new Date().toISOString(),
    };
    saveRun(entry);
    res.json(entry);
  } catch (err) {
    const entry = {
      id: Date.now(),
      dryRun: Boolean(dryRun),
      collectionHandle: collectionHandle || null,
      error: err.message,
      code: err.code,
      upgradePlan: err.upgradePlan,
      logs,
      createdAt: new Date().toISOString(),
    };
    saveRun(entry);
    if (err.name === "PlanError") {
      return res.status(402).json(entry);
    }
    res.status(500).json(entry);
  } finally {
    sortInProgress = false;
  }
});

const webDist = join(ROOT, "web", "dist");
const FAVICON_FILES = [
  ["favicon.ico", "image/x-icon"],
  ["favicon-16x16.png", "image/png"],
  ["favicon-32x32.png", "image/png"],
  ["favicon.png", "image/png"],
  ["apple-touch-icon.png", "image/png"],
  ["site.webmanifest", "application/manifest+json"],
];

if (existsSync(join(webDist, "index.html"))) {
  for (const [name, type] of FAVICON_FILES) {
    const filePath = join(webDist, name);
    if (!existsSync(filePath)) continue;
    app.get(`/${name}`, (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.type(type);
      res.sendFile(filePath);
    });
  }

  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(webDist, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Stockladder API → http://localhost:${PORT}`);
  if (existsSync(join(webDist, "index.html"))) {
    console.log(`Dashboard UI → http://localhost:${PORT}`);
  } else {
    console.log(`Start UI dev server → npm run dev:web (port 5173)`);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is in use. Run: lsof -ti :${PORT} | xargs kill -9\n`,
    );
    process.exit(1);
  }
  throw err;
});
