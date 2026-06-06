import { useMemo, useState } from "react";
import {
  BlockStack,
  Button,
  Checkbox,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

const STRATEGY_OPTIONS = [
  { label: "Use global default", value: "" },
  {
    label: "Full inventory sort",
    value: "inventory_full",
  },
  {
    label: "OOS to bottom only",
    value: "oos_bottom_only",
  },
  {
    label: "Best selling, then inventory",
    value: "bestselling_then_inventory",
  },
];

const WITHIN_TIER_OPTIONS = [
  { label: "Use global default", value: "" },
  { label: "Highest inventory first", value: "inventory_desc" },
  { label: "Lowest inventory first", value: "inventory_asc" },
  { label: "Newest first", value: "created_desc" },
  { label: "Oldest first", value: "created_asc" },
  { label: "Best selling order", value: "bestselling" },
  { label: "Sales units (lookback)", value: "sales_units" },
  { label: "Sales revenue (lookback)", value: "sales_revenue" },
  { label: "GA4 page views", value: "ga4_views" },
  { label: "GA4 add-to-cart rate", value: "ga4_atc" },
  { label: "Keep current order", value: "manual" },
];

const OOS_OPTIONS = [
  { label: "Use global default", value: "" },
  { label: "Push to bottom", value: "push_down" },
  { label: "Hide from collection", value: "hide" },
];

function cleanRule(rule) {
  const out = {};
  if (rule.skip) out.skip = true;
  if (rule.sortStrategy) out.sortStrategy = rule.sortStrategy;
  if (rule.withinTierSort) out.withinTierSort = rule.withinTierSort;
  if (rule.outOfStockAction) out.outOfStockAction = rule.outOfStockAction;
  if (rule.lowStockThreshold !== "" && rule.lowStockThreshold != null) {
    out.lowStockThreshold = Number(rule.lowStockThreshold);
  }
  return out;
}

export default function CollectionRulesEditor({
  collectionRules,
  onChange,
  collections,
}) {
  const [selectedHandle, setSelectedHandle] = useState("");

  const collectionOptions = useMemo(
    () => [
      { label: "Select a collection…", value: "" },
      ...collections.map((c) => ({
        label: `${c.title} (${c.handle})`,
        value: c.handle,
      })),
    ],
    [collections],
  );

  const existingHandles = Object.keys(collectionRules ?? {});

  const current = selectedHandle
    ? {
        skip: false,
        sortStrategy: "",
        withinTierSort: "",
        outOfStockAction: "",
        ...(collectionRules?.[selectedHandle] ?? {}),
        lowStockThreshold:
          collectionRules?.[selectedHandle]?.lowStockThreshold ?? "",
      }
    : null;

  const updateCurrent = (patch) => {
    if (!selectedHandle) return;
    const merged = { ...current, ...patch };
    const cleaned = cleanRule(merged);
    const next = { ...(collectionRules ?? {}) };

    if (Object.keys(cleaned).length === 0) {
      delete next[selectedHandle];
    } else {
      next[selectedHandle] = cleaned;
    }
    onChange(next);
  };

  const removeRule = (handle) => {
    const next = { ...(collectionRules ?? {}) };
    delete next[handle];
    onChange(next);
    if (selectedHandle === handle) setSelectedHandle("");
  };

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">
        Override global sort rules for specific collections — e.g. skip{" "}
        <code>sale</code>, or use newest-first on <code>new-in</code>.
      </Text>

      <Select
        label="Collection"
        options={collectionOptions}
        value={selectedHandle}
        onChange={setSelectedHandle}
      />

      {current && (
        <BlockStack gap="300">
          <Checkbox
            label="Skip this collection (never auto-sort)"
            checked={Boolean(current.skip)}
            onChange={(v) => updateCurrent({ skip: v })}
          />

          {!current.skip && (
            <>
              <Select
                label="Strategy override"
                options={STRATEGY_OPTIONS}
                value={current.sortStrategy ?? ""}
                onChange={(v) => updateCurrent({ sortStrategy: v })}
              />
              <Select
                label="Within-tier sort override"
                options={WITHIN_TIER_OPTIONS}
                value={current.withinTierSort ?? ""}
                onChange={(v) => updateCurrent({ withinTierSort: v })}
              />
              <Select
                label="Out-of-stock override"
                options={OOS_OPTIONS}
                value={current.outOfStockAction ?? ""}
                onChange={(v) => updateCurrent({ outOfStockAction: v })}
              />
              <TextField
                label="Low-stock threshold override"
                type="number"
                value={String(current.lowStockThreshold ?? "")}
                onChange={(v) => updateCurrent({ lowStockThreshold: v })}
                helpText="Leave empty to use global threshold"
                autoComplete="off"
              />
            </>
          )}
        </BlockStack>
      )}

      {existingHandles.length > 0 && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Active overrides ({existingHandles.length})
          </Text>
          {existingHandles.map((handle) => {
            const rule = collectionRules[handle];
            const col = collections.find((c) => c.handle === handle);
            const summary = rule.skip
              ? "Skip"
              : [
                  rule.sortStrategy,
                  rule.withinTierSort,
                  rule.outOfStockAction,
                  rule.lowStockThreshold != null
                    ? `low≤${rule.lowStockThreshold}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Custom";

            return (
              <InlineStack key={handle} gap="200" blockAlign="center">
                <Text as="span">{col?.title ?? handle}</Text>
                <Text as="span" tone="subdued">
                  {summary}
                </Text>
                <Button size="slim" onClick={() => setSelectedHandle(handle)}>
                  Edit
                </Button>
                <Button
                  size="slim"
                  tone="critical"
                  onClick={() => removeRule(handle)}
                >
                  Remove
                </Button>
              </InlineStack>
            );
          })}
        </BlockStack>
      )}
    </BlockStack>
  );
}
