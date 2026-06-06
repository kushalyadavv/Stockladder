import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  DataTable,
  Divider,
  InlineGrid,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { api } from "./api.js";

const SALES_PERIOD_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];

const AB_STRATEGY_OPTIONS = [
  { label: "Full inventory sort", value: "inventory_full" },
  { label: "OOS bottom only", value: "oos_bottom_only" },
  { label: "Best selling → inventory", value: "bestselling_then_inventory" },
  { label: "Sales units → inventory (needs read_orders)", value: "sales_then_inventory" },
  { label: "Revenue → inventory (needs read_orders)", value: "revenue_then_inventory" },
];

const AB_WITHIN_OPTIONS = [
  { label: "From strategy", value: "" },
  { label: "Sales units", value: "sales_units" },
  { label: "Sales revenue", value: "sales_revenue" },
  { label: "GA4 views", value: "ga4_views" },
  { label: "GA4 ATC rate", value: "ga4_atc" },
  { label: "High inventory", value: "inventory_desc" },
  { label: "Newest", value: "created_desc" },
];

function needsOrders(strategy, withinTier) {
  return (
    strategy === "sales_then_inventory" ||
    strategy === "revenue_then_inventory" ||
    withinTier === "sales_units" ||
    withinTier === "sales_revenue"
  );
}

function emptySeasonal() {
  return {
    handle: "",
    title: "",
    days: 30,
    limit: 20,
    sourceCollectionHandle: "",
    enabled: true,
    applySort: true,
  };
}

function emptyMirror() {
  return { sourceHandle: "", targetHandle: "", targetTitle: "", applySort: true };
}

export default function Tier3Panel({
  config,
  setConfig,
  collections,
  onSave,
  saving,
  onToast,
  ordersScope,
  features = {},
}) {
  const [analytics, setAnalytics] = useState({ entries: [] });
  const [ga4, setGa4] = useState(null);
  const [abHandle, setAbHandle] = useState("shop-all-products");
  const [abA, setAbA] = useState({
    name: "Inventory first",
    sortStrategy: "inventory_full",
    withinTierSort: "",
  });
  const [abB, setAbB] = useState({
    name: "Best sellers",
    sortStrategy: "bestselling_then_inventory",
    withinTierSort: "",
  });
  const [abResult, setAbResult] = useState(null);
  const [abLoading, setAbLoading] = useState(false);
  const [ga4Csv, setGa4Csv] = useState("");
  const [ga4Importing, setGa4Importing] = useState(false);
  const [seasonalDraft, setSeasonalDraft] = useState(emptySeasonal());
  const [mirrorDraft, setMirrorDraft] = useState(emptyMirror());
  const [syncing, setSyncing] = useState(false);

  const collectionOptions = collections.map((c) => ({
    label: `${c.title} (${c.handle})`,
    value: c.handle,
  }));

  const ordersOk = ordersScope?.ok !== false;

  const refreshTier3 = useCallback(async () => {
    const [a, g] = await Promise.all([api.getAnalytics(), api.getGa4()]);
    setAnalytics(a);
    setGa4(g);
  }, []);

  useEffect(() => {
    refreshTier3().catch(() => {});
  }, [refreshTier3]);

  const importGa4 = async () => {
    if (!ga4Csv.trim()) return;
    setGa4Importing(true);
    try {
      const result = await api.importGa4({
        csv: ga4Csv,
        propertyId: config.ga4PropertyId,
      });
      await refreshTier3();
      onToast?.({
        tone: "success",
        message: `Imported ${result.imported} product(s) from GA4`,
      });
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setGa4Importing(false);
    }
  };

  const runAbCompare = async () => {
    if (
      !ordersOk &&
      (needsOrders(abA.sortStrategy, abA.withinTierSort) ||
        needsOrders(abB.sortStrategy, abB.withinTierSort))
    ) {
      onToast?.({
        tone: "warning",
        message:
          ordersScope?.message ||
          "Sales strategies need read_orders — comparison will treat all sales as zero",
      });
    }

    setAbLoading(true);
    try {
      const result = await api.compareAb({
        handle: abHandle,
        variantA: {
          name: abA.name,
          sortStrategy: abA.sortStrategy,
          withinTierSort: abA.withinTierSort || undefined,
        },
        variantB: {
          name: abB.name,
          sortStrategy: abB.sortStrategy,
          withinTierSort: abB.withinTierSort || undefined,
        },
      });
      setAbResult(result);
      if (result.warnings?.length) {
        onToast?.({ tone: "warning", message: result.warnings[0] });
      }
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setAbLoading(false);
    }
  };

  const applyAbWinner = async (variant, dryRun) => {
    setAbLoading(true);
    try {
      await api.applyAb({ handle: abHandle, variant, dryRun });
      await refreshTier3();
      onToast?.({
        tone: "success",
        message: dryRun ? "Dry-run complete" : "Winning strategy applied",
      });
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setAbLoading(false);
    }
  };

  const addSeasonal = () => {
    if (!seasonalDraft.handle.trim()) return;
    setConfig((c) => ({
      ...c,
      seasonalCollections: [
        ...(c.seasonalCollections ?? []),
        { ...seasonalDraft, handle: seasonalDraft.handle.trim() },
      ],
    }));
    setSeasonalDraft(emptySeasonal());
  };

  const addMirror = () => {
    if (!mirrorDraft.sourceHandle.trim()) return;
    setConfig((c) => ({
      ...c,
      smartCollectionMirrors: [
        ...(c.smartCollectionMirrors ?? []),
        { ...mirrorDraft, sourceHandle: mirrorDraft.sourceHandle.trim() },
      ],
    }));
    setMirrorDraft(emptyMirror());
  };

  const runSeasonalSync = async (dryRun) => {
    setSyncing(true);
    try {
      await onSave?.();
      await api.syncSeasonal({ dryRun });
      onToast?.({ tone: "success", message: dryRun ? "Seasonal preview done" : "Seasonal sync done" });
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const runSmartSync = async (dryRun) => {
    setSyncing(true);
    try {
      await onSave?.();
      await api.syncSmart({ dryRun });
      onToast?.({ tone: "success", message: dryRun ? "Mirror preview done" : "Mirror sync done" });
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const renderAbTop = (rows) =>
    rows.map((r) => [
      r.pos,
      (r.title ?? "").slice(0, 24),
      r.inventory ?? "—",
      r.sales ?? r.ga4Views ?? "—",
    ]);

  const analyticsRows = (analytics.entries ?? []).slice(0, 5).map((e) => [
    new Date(e.recordedAt).toLocaleDateString(),
    e.handle,
    e.moves,
    `${e.movedUp}↑ ${e.movedDown}↓`,
  ]);

  return (
    <BlockStack gap="400">
      {!ordersOk && (
        <Banner tone="warning" title="read_orders not enabled">
          {ordersScope?.message ||
            "Add read_orders in Dev Dashboard → release → npm run auth:install. Until then, sales-based sorts compare as zero sales."}
        </Banner>
      )}

      <Card>
        <InlineGrid columns={{ xs: 1, lg: 2 }} gap="500">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Sales data (Shopify)
            </Text>
            <Banner tone="info">
              For most stores you do <strong>not</strong> need GA4. Use{" "}
              <strong>Best selling → inventory</strong> or{" "}
              <strong>Sales units → inventory</strong> (Sort settings / A/B tab)
              — both use Shopify order data. GA4 is only for page views &amp;
              add-to-cart rate, which Shopify does not expose per product via
              API.
            </Banner>
            <Select
              label="Sales lookback"
              options={SALES_PERIOD_OPTIONS}
              value={String(config.salesLookbackDays ?? 30)}
              onChange={(v) =>
                setConfig((c) => ({ ...c, salesLookbackDays: Number(v) }))
              }
            />
            {!features.ga4Import && (
              <Banner tone="info">GA4 import requires Pro plan.</Banner>
            )}
            <Text as="h3" variant="headingSm">
              GA4 import (optional)
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Only if you use GA4 on the storefront: Analytics → Explore → Free
              form → dimension <em>Page path</em> (filter /products/) or{" "}
              <em>Item name</em> → metrics Views &amp; Add to carts → Share →
              Download CSV. Map columns to handle, views, add to carts.
            </Text>
            <TextField
              label="GA4 CSV paste"
              value={ga4Csv}
              onChange={setGa4Csv}
              multiline={3}
              helpText={
                ga4?.importedAt
                  ? `${Object.keys(ga4.products ?? {}).length} products · ${new Date(ga4.importedAt).toLocaleDateString()}`
                  : "Skip this if you use Shopify sales/bestseller strategies above"
              }
              autoComplete="off"
            />
            <InlineStack gap="200">
              <Button
                size="slim"
                onClick={importGa4}
                loading={ga4Importing}
                disabled={!features.ga4Import}
              >
                Import GA4
              </Button>
              <Button size="slim" onClick={onSave} loading={saving}>
                Save
              </Button>
            </InlineStack>
          </BlockStack>

          <BlockStack gap="300">
            {!features.abCompare && (
              <Banner tone="info">A/B compare requires Pro plan.</Banner>
            )}
            <Text as="h3" variant="headingSm">
              A/B compare
            </Text>
            <Select
              label="Collection"
              options={collectionOptions}
              value={abHandle}
              onChange={setAbHandle}
            />
            <InlineGrid columns={2} gap="200">
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  Variant A
                </Text>
                <Select
                  label="Strategy"
                  labelHidden
                  options={AB_STRATEGY_OPTIONS}
                  value={abA.sortStrategy}
                  onChange={(v) => setAbA((s) => ({ ...s, sortStrategy: v }))}
                />
              </BlockStack>
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  Variant B
                </Text>
                <Select
                  label="Strategy"
                  labelHidden
                  options={AB_STRATEGY_OPTIONS}
                  value={abB.sortStrategy}
                  onChange={(v) => setAbB((s) => ({ ...s, sortStrategy: v }))}
                />
              </BlockStack>
            </InlineGrid>
            <Button
              onClick={runAbCompare}
              loading={abLoading}
              disabled={!features.abCompare}
            >
              Compare
            </Button>

            {abResult && (
              <BlockStack gap="200">
                {abResult.warnings?.map((w) => (
                  <Banner key={w} tone="warning">
                    {w}
                  </Banner>
                ))}
                <Text as="p" variant="bodySm">
                  {abResult.differences} products rank differently
                </Text>
                <InlineGrid columns={2} gap="200">
                  <DataTable
                    columnContentTypes={["numeric", "text", "numeric", "numeric"]}
                    headings={["#", "A", "Stk", "Sig"]}
                    rows={renderAbTop(abResult.variantA.top.slice(0, 6))}
                  />
                  <DataTable
                    columnContentTypes={["numeric", "text", "numeric", "numeric"]}
                    headings={["#", "B", "Stk", "Sig"]}
                    rows={renderAbTop(abResult.variantB.top.slice(0, 6))}
                  />
                </InlineGrid>
                <InlineStack gap="200" wrap>
                  <Button size="slim" onClick={() => applyAbWinner(abResult.variantA.config, false)} loading={abLoading}>
                    Apply A
                  </Button>
                  <Button size="slim" onClick={() => applyAbWinner(abResult.variantB.config, false)} loading={abLoading}>
                    Apply B
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </InlineGrid>
      </Card>

      <Card>
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="500">
          <BlockStack gap="200">
            {!features.seasonalSync && (
              <Banner tone="info">Seasonal collections require Pro plan.</Banner>
            )}
            <Text as="h3" variant="headingSm">
              Seasonal collections
            </Text>
            <InlineGrid columns={2} gap="200">
              <TextField
                label="Handle"
                value={seasonalDraft.handle}
                onChange={(v) => setSeasonalDraft((s) => ({ ...s, handle: v }))}
                autoComplete="off"
              />
              <TextField
                label="Limit"
                type="number"
                value={String(seasonalDraft.limit)}
                onChange={(v) =>
                  setSeasonalDraft((s) => ({ ...s, limit: Number(v) || 20 }))
                }
                autoComplete="off"
              />
            </InlineGrid>
            <Button
              size="slim"
              onClick={addSeasonal}
              disabled={!features.seasonalSync}
            >
              Add rule
            </Button>
            {(config.seasonalCollections ?? []).map((s, i) => (
              <Text key={s.handle} as="p" variant="bodySm" tone="subdued">
                {s.handle} · {s.days}d · top {s.limit}
                <Button
                  size="slim"
                  tone="critical"
                  variant="plain"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      seasonalCollections: c.seasonalCollections.filter(
                        (_, idx) => idx !== i,
                      ),
                    }))
                  }
                >
                  ×
                </Button>
              </Text>
            ))}
            <InlineStack gap="200">
              <Button size="slim" onClick={() => runSeasonalSync(true)} loading={syncing}>
                Preview
              </Button>
              <Button size="slim" variant="primary" onClick={() => runSeasonalSync(false)} loading={syncing}>
                Sync
              </Button>
            </InlineStack>
          </BlockStack>

          <BlockStack gap="200">
            {!features.smartMirrors && (
              <Banner tone="info">Smart mirrors require Pro plan.</Banner>
            )}
            <Text as="h3" variant="headingSm">
              Smart → manual mirrors
            </Text>
            <TextField
              label="Smart source handle"
              value={mirrorDraft.sourceHandle}
              onChange={(v) =>
                setMirrorDraft((s) => ({ ...s, sourceHandle: v }))
              }
              autoComplete="off"
            />
            <Button
              size="slim"
              onClick={addMirror}
              disabled={!features.smartMirrors}
            >
              Add mirror
            </Button>
            {(config.smartCollectionMirrors ?? []).map((m, i) => (
              <Text key={i} as="p" variant="bodySm" tone="subdued">
                {m.sourceHandle} → {m.targetHandle || `${m.sourceHandle}-sorted`}
                <Button
                  size="slim"
                  tone="critical"
                  variant="plain"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      smartCollectionMirrors: c.smartCollectionMirrors.filter(
                        (_, idx) => idx !== i,
                      ),
                    }))
                  }
                >
                  ×
                </Button>
              </Text>
            ))}
            <InlineStack gap="200">
              <Button size="slim" onClick={() => runSmartSync(true)} loading={syncing}>
                Preview
              </Button>
              <Button size="slim" variant="primary" onClick={() => runSmartSync(false)} loading={syncing}>
                Sync
              </Button>
            </InlineStack>
          </BlockStack>
        </InlineGrid>

        <Divider />

        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Sort analytics
          </Text>
          {analyticsRows.length > 0 ? (
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text"]}
              headings={["Date", "Collection", "Moves", "Shift"]}
              rows={analyticsRows}
            />
          ) : (
            <Text as="p" tone="subdued" variant="bodySm">
              Recorded after live sorts.
            </Text>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
