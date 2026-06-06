import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { api } from "./api.js";
import CollectionPicker from "./CollectionPicker.jsx";
import RuleStackEditor from "./RuleStackEditor.jsx";
import CollectionRulesEditor from "./CollectionRulesEditor.jsx";
import Tier3Panel from "./Tier3Panel.jsx";
import PlanPanel from "./PlanPanel.jsx";
import InstallGate from "./InstallGate.jsx";
import { getShopFromUrl } from "./session.js";

const EMPTY_CONFIG = {
  forceManualSort: true,
  includeHandles: [],
  excludeHandles: [],
  deprioritizeCollectionHandles: [],
  untrackedPosition: "top",
  sortDirection: "desc",
  minMovesBeforeReorder: 1,
  sortStrategy: "inventory_full",
  withinTierSort: undefined,
  outOfStockAction: "push_down",
  useOnlineInventory: false,
  pinTags: ["featured", "pin-top"],
  promoteTags: [],
  demoteTags: [],
  promoteVendors: [],
  demoteVendors: [],
  lowStockThreshold: 5,
  sortRuleStack: [],
  collectionRules: {},
  sortVariantsByInventory: false,
  salesLookbackDays: 30,
  ga4PropertyId: "",
  seasonalCollections: [],
  smartCollectionMirrors: [],
  webhookDebounceMs: 90000,
};

const TABS = [
  { id: "run", content: "Run & preview" },
  { id: "settings", content: "Sort settings" },
  { id: "collections", content: "Collections" },
  { id: "growth", content: "Sales & A/B" },
  { id: "plan", content: "Plan & billing" },
  { id: "history", content: "History" },
];

const STRATEGY_OPTIONS = [
  { label: "Full inventory (high stock first)", value: "inventory_full" },
  { label: "OOS to bottom only", value: "oos_bottom_only" },
  { label: "Best selling → inventory", value: "bestselling_then_inventory" },
  { label: "Sales units → inventory", value: "sales_then_inventory" },
  { label: "Revenue → inventory", value: "revenue_then_inventory" },
];

function tagsToText(tags) {
  return (tags ?? []).join(", ");
}

function textToTags(text) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function App({ embedded = false }) {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [collections, setCollections] = useState([]);
  const [runs, setRuns] = useState([]);
  const [snapshots, setSnapshots] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [previewHandle, setPreviewHandle] = useState("shop-all-products");
  const [runHandle, setRunHandle] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [planInfo, setPlanInfo] = useState(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  const shopFromUrl = getShopFromUrl();

  const features = planInfo?.features ?? health?.plan?.features ?? {};
  const planName = planInfo?.planName ?? health?.plan?.planName ?? "Free";

  const collectionOptions = useMemo(
    () => [
      { label: "All configured collections", value: "" },
      ...collections.map((c) => ({
        label: `${c.title} (${c.handle})`,
        value: c.handle,
      })),
    ],
    [collections],
  );

  const previewOptions = useMemo(
    () =>
      collections.map((c) => ({
        label: `${c.title} (${c.handle})`,
        value: c.handle,
      })),
    [collections],
  );

  const refresh = useCallback(async () => {
    const [cfg, cols, runList, h, snaps] = await Promise.all([
      api.getConfig(),
      api.getCollections(),
      api.getRuns(),
      api.health(),
      api.getSnapshots(),
    ]);
    setConfig(cfg);
    setCollections(cols);
    setRuns(runList);
    setHealth(h);
    setSnapshots(snaps);
  }, []);

  useEffect(() => {
    if (!embedded && !shopFromUrl) {
      setNeedsInstall(true);
      setLoading(false);
      return;
    }

    refresh()
      .catch((e) => {
        if (e.code === "AUTH_REQUIRED" || e.code === "SHOP_REQUIRED") {
          setNeedsInstall(true);
          return;
        }
        setToast({ tone: "critical", message: e.message });
      })
      .finally(() => setLoading(false));
  }, [refresh, embedded, shopFromUrl]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      setToast({ tone: "success", message: "Settings saved" });
    } catch (e) {
      const upgrade =
        e.upgradePlan && e.status === 402
          ? ` Upgrade to ${e.upgradePlan}.`
          : "";
      setToast({ tone: "critical", message: `${e.message}${upgrade}` });
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    if (!previewHandle) return;
    setPreviewLoading(true);
    try {
      const data = await api.diagnose(previewHandle);
      setPreview(data);
    } catch (e) {
      setToast({ tone: "critical", message: e.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeSort = async (dryRun) => {
    setRunning(true);
    setLiveLogs([]);
    try {
      const result = await api.runSort({
        dryRun,
        collectionHandle: runHandle,
      });
      setLiveLogs(result.logs ?? []);
      await refresh();
      setToast({
        tone: result.error ? "critical" : "success",
        message: result.error
          ? result.error
          : dryRun
            ? "Dry run complete"
            : `Sort complete (${result.summary?.totalMoves ?? 0} moves)`,
      });
    } catch (e) {
      const upgrade =
        e.upgradePlan && e.status === 402
          ? ` Open Plan & billing to upgrade.`
          : "";
      setToast({ tone: "critical", message: `${e.message}${upgrade}` });
      if (e.status === 402) setSelectedTab(4);
    } finally {
      setRunning(false);
    }
  };

  const executeRevert = async () => {
    setReverting(true);
    try {
      const result = await api.revert({
        handle: runHandle || undefined,
      });
      await refresh();
      setToast({
        tone: "success",
        message: `Reverted ${result.results.length} collection(s)`,
      });
    } catch (e) {
      setToast({ tone: "critical", message: e.message });
    } finally {
      setReverting(false);
    }
  };

  const ordersBanner = health?.ordersScope?.ok === false && (
    <Banner tone="warning" title="Sales data unavailable">
      {health.ordersScope.message ||
        "Add read_orders scope in Dev Dashboard, release the app, then run npm run auth:install"}
    </Banner>
  );

  if (loading) {
    return (
      <Page title="Stockladder">
        <Card>
          <Text as="p">Loading…</Text>
        </Card>
      </Page>
    );
  }

  if (needsInstall) {
    return <InstallGate shop={shopFromUrl} embedded={embedded} />;
  }

  const runTab = (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={health?.ok ? "success" : "critical"}>
              {health?.store ?? "Not connected"}
            </Badge>
            <Badge tone="info">{planName}</Badge>
            <Text as="span" tone="subdued">
              {config.sortStrategy} · OOS: {config.outOfStockAction}
              {snapshots?.latestRun
                ? ` · Snapshot ${new Date(snapshots.latestRun).toLocaleDateString()}`
                : ""}
            </Text>
          </InlineStack>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Select
            label="Run on collection"
            options={collectionOptions}
            value={runHandle}
            onChange={setRunHandle}
          />
          <Select
            label="Preview collection"
            options={previewOptions}
            value={previewHandle}
            onChange={setPreviewHandle}
          />
        </InlineGrid>

        <InlineStack gap="200" wrap>
          <Button
            variant="primary"
            onClick={() => executeSort(false)}
            loading={running}
            disabled={running || reverting}
          >
            Run sort
          </Button>
          <Button
            onClick={() => executeSort(true)}
            loading={running}
            disabled={running || reverting}
          >
            Dry run
          </Button>
          <Button
            tone="critical"
            onClick={executeRevert}
            loading={reverting}
            disabled={running || reverting}
          >
            Revert snapshot
          </Button>
          <Button onClick={loadPreview} loading={previewLoading}>
            Load preview
          </Button>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Preview (top 12)
            </Text>
            {preview?.skipped ? (
              <Banner tone="info">{preview.message}</Banner>
            ) : preview ? (
              <>
                <Text as="p" variant="bodySm">
                  {preview.collection.title} — {preview.movesNeeded}/
                  {preview.productCount} would move
                </Text>
                <DataTable
                  columnContentTypes={["numeric", "text", "numeric", "text"]}
                  headings={["#", "Product", "Stock", "Tier"]}
                  rows={preview.previewTop.map((r) => [
                    r.pos,
                    r.title.slice(0, 32),
                    r.totalInventory,
                    r.rule ?? "—",
                  ])}
                />
              </>
            ) : (
              <Text as="p" tone="subdued" variant="bodySm">
                Select a collection and click Load preview.
              </Text>
            )}
          </BlockStack>

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Run log
            </Text>
            {liveLogs.length > 0 ? (
              <Box
                padding="200"
                background="bg-surface-secondary"
                borderRadius="200"
                maxHeight="280px"
                overflowY="scroll"
              >
                <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {liveLogs.join("\n")}
                </pre>
              </Box>
            ) : (
              <Text as="p" tone="subdued" variant="bodySm">
                Logs appear after a sort run.
              </Text>
            )}
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Card>
  );

  const settingsTab = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Core strategy
              </Text>
              <Select
                label="Strategy preset"
                options={STRATEGY_OPTIONS}
                value={config.sortStrategy}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, sortStrategy: v }))
                }
              />
              <InlineGrid columns={2} gap="200">
                <Select
                  label="Out of stock"
                  options={[
                    { label: "Push down", value: "push_down" },
                    {
                      label: features.hideOos
                        ? "Hide"
                        : "Hide (Growth+)",
                      value: "hide",
                      disabled: !features.hideOos,
                    },
                  ]}
                  value={config.outOfStockAction}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, outOfStockAction: v }))
                  }
                />
                <Select
                  label="Stock direction"
                  options={[
                    { label: "High first", value: "desc" },
                    { label: "Low first", value: "asc" },
                  ]}
                  value={config.sortDirection}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, sortDirection: v }))
                  }
                />
              </InlineGrid>
              <InlineGrid columns={2} gap="200">
                <Select
                  label="Untracked inventory"
                  options={[
                    { label: "Top", value: "top" },
                    { label: "Bottom", value: "bottom" },
                  ]}
                  value={config.untrackedPosition}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, untrackedPosition: v }))
                  }
                />
                <TextField
                  label="Low-stock ≤ units"
                  type="number"
                  value={String(config.lowStockThreshold ?? 5)}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      lowStockThreshold: Number(v) || 0,
                    }))
                  }
                  autoComplete="off"
                />
              </InlineGrid>
              <InlineStack gap="400" wrap>
                <Checkbox
                  label="Online sellable qty"
                  checked={config.useOnlineInventory}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, useOnlineInventory: v }))
                  }
                />
                <Checkbox
                  label="Force manual sort"
                  checked={config.forceManualSort}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, forceManualSort: v }))
                  }
                />
                <Checkbox
                  label={
                    features.variantSort
                      ? "Sort variants by stock"
                      : "Sort variants by stock (Growth+)"
                  }
                  checked={config.sortVariantsByInventory}
                  disabled={!features.variantSort}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, sortVariantsByInventory: v }))
                  }
                />
              </InlineStack>
            </BlockStack>

            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Tags & vendors
              </Text>
              <TextField
                label="Pin tags"
                value={tagsToText(config.pinTags)}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, pinTags: textToTags(v) }))
                }
                autoComplete="off"
              />
              <InlineGrid columns={2} gap="200">
                <TextField
                  label="Promote tags"
                  value={tagsToText(config.promoteTags)}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, promoteTags: textToTags(v) }))
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Demote tags"
                  value={tagsToText(config.demoteTags)}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, demoteTags: textToTags(v) }))
                  }
                  autoComplete="off"
                />
              </InlineGrid>
              <InlineGrid columns={2} gap="200">
                <TextField
                  label="Promote vendors"
                  value={tagsToText(config.promoteVendors)}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      promoteVendors: textToTags(v),
                    }))
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Demote vendors"
                  value={tagsToText(config.demoteVendors)}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      demoteVendors: textToTags(v),
                    }))
                  }
                  autoComplete="off"
                />
              </InlineGrid>
            </BlockStack>
          </InlineGrid>

          <Divider />

          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Rule stack
            </Text>
            {!features.ruleStack && (
              <Banner tone="info">
                Custom rule stack requires Growth plan or higher.
              </Banner>
            )}
            <RuleStackEditor
              stack={config.sortRuleStack}
              disabled={!features.ruleStack}
              onChange={(stack) =>
                setConfig((c) => ({ ...c, sortRuleStack: stack }))
              }
            />
          </BlockStack>

          <Button variant="primary" onClick={saveSettings} loading={saving}>
            Save settings
          </Button>
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const collectionsTab = (
    <Card>
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="500">
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Per-collection overrides
          </Text>
          <CollectionRulesEditor
            collectionRules={config.collectionRules ?? {}}
            onChange={(rules) =>
              setConfig((c) => ({ ...c, collectionRules: rules }))
            }
            collections={collections}
          />
        </BlockStack>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Collection scope
          </Text>
          <CollectionPicker
            label="Deprioritize (accessories → bottom)"
            selected={config.deprioritizeCollectionHandles ?? []}
            onChange={(v) =>
              setConfig((c) => ({
                ...c,
                deprioritizeCollectionHandles: v,
              }))
            }
            collections={collections}
          />
          <CollectionPicker
            label="Exclude from sort"
            selected={config.excludeHandles ?? []}
            onChange={(v) =>
              setConfig((c) => ({ ...c, excludeHandles: v }))
            }
            collections={collections}
          />
          <CollectionPicker
            label="Include only (optional)"
            selected={config.includeHandles ?? []}
            onChange={(v) =>
              setConfig((c) => ({ ...c, includeHandles: v }))
            }
            collections={collections}
          />
        </BlockStack>
      </InlineGrid>
      <Box paddingBlockStart="400">
        <Button onClick={saveSettings} loading={saving}>
          Save collection rules
        </Button>
      </Box>
    </Card>
  );

  const historyTab = (
    <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Snapshots
          </Text>
          {snapshots?.collections?.length > 0 ? (
            <DataTable
              columnContentTypes={["text", "numeric", "text"]}
              headings={["Collection", "Products", "Saved"]}
              rows={snapshots.collections.map((s) => [
                s.title ?? s.handle,
                s.productCount,
                new Date(s.savedAt).toLocaleString(),
              ])}
            />
          ) : (
            <Text as="p" tone="subdued" variant="bodySm">
              Saved automatically before each live sort.
            </Text>
          )}
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Recent runs
          </Text>
          {runs.length > 0 ? (
            <DataTable
              columnContentTypes={["text", "text", "text", "numeric"]}
              headings={["When", "Mode", "Collection", "Moves"]}
              rows={runs.slice(0, 8).map((r) => [
                new Date(r.createdAt).toLocaleString(),
                r.dryRun ? "Dry" : "Live",
                r.collectionHandle || "All",
                r.summary?.totalMoves ?? "—",
              ])}
            />
          ) : (
            <Text as="p" tone="subdued" variant="bodySm">
              No runs yet.
            </Text>
          )}
          <Divider />
          <Text as="p" variant="bodySm" tone="subdued">
            Webhooks: <code>npm run webhooks:register</code> (needs public URL)
          </Text>
        </BlockStack>
      </Card>
    </InlineGrid>
  );

  const tabPanels = [runTab, settingsTab, collectionsTab, null, null, historyTab];

  return (
    <Page
      title="Stockladder"
      subtitle="Inventory merchandising for Shopify collections"
      primaryAction={{
        content: "Run sort",
        onAction: () => {
          setSelectedTab(0);
          executeSort(false);
        },
        loading: running,
        disabled: running || reverting,
      }}
      secondaryActions={[
        {
          content: "Dry run",
          onAction: () => {
            setSelectedTab(0);
            executeSort(true);
          },
          loading: running,
        },
        { content: "Refresh", onAction: refresh },
      ]}
    >
      <Layout>
        {toast && (
          <Layout.Section>
            <Banner tone={toast.tone} onDismiss={() => setToast(null)}>
              {toast.message}
            </Banner>
          </Layout.Section>
        )}

        {ordersBanner && selectedTab !== 3 && (
          <Layout.Section>{ordersBanner}</Layout.Section>
        )}

        <Layout.Section>
          <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
            <Box paddingBlockStart="400">
              {selectedTab === 3 ? (
                <Tier3Panel
                  config={config}
                  setConfig={setConfig}
                  collections={collections}
                  onSave={saveSettings}
                  saving={saving}
                  onToast={setToast}
                  ordersScope={health?.ordersScope}
                  features={features}
                />
              ) : selectedTab === 4 ? (
                <PlanPanel
                  onToast={setToast}
                  onPlanChange={(data) => {
                    setPlanInfo(data);
                    refresh().catch(() => {});
                  }}
                />
              ) : (
                tabPanels[selectedTab]
              )}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
