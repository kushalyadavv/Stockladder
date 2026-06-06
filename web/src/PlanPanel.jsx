import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { api } from "./api.js";

function meterPercent(used, limit) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function PlanCard({ plan, currentPlanId, onSelect, loading }) {
  const isCurrent = plan.id === currentPlanId;
  const tone = plan.id === "pro" ? "success" : plan.id === "growth" ? "info" : undefined;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingMd">
            {plan.name}
          </Text>
          {isCurrent ? (
            <Badge tone="success">Current</Badge>
          ) : (
            <Badge tone={tone}>
              {plan.price ? `$${plan.price}/mo` : "Free"}
            </Badge>
          )}
        </InlineStack>

        {plan.trialDays > 0 && !isCurrent && plan.price > 0 && (
          <Text as="p" variant="bodySm" tone="subdued">
            {plan.trialDays}-day free trial
          </Text>
        )}

        <BlockStack gap="100">
          {plan.highlights.map((line) => (
            <Text as="p" key={line} variant="bodySm">
              • {line}
            </Text>
          ))}
        </BlockStack>

        {!isCurrent && (
          <Button
            variant={plan.id === "pro" ? "primary" : undefined}
            onClick={() => onSelect(plan.id)}
            loading={loading}
          >
            {plan.price ? `Upgrade to ${plan.name}` : "Downgrade to Free"}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}

export default function PlanPanel({ onToast, onPlanChange }) {
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState("");

  const refresh = useCallback(async () => {
    const data = await api.getPlan();
    setPlanData(data);
    onPlanChange?.(data);
  }, [onPlanChange]);

  useEffect(() => {
    refresh()
      .catch((e) => onToast?.({ tone: "critical", message: e.message }))
      .finally(() => setLoading(false));
  }, [refresh, onToast]);

  const handleSelect = async (planId) => {
    setSubscribing(planId);
    try {
      const result = await api.subscribePlan(planId);
      if (result.confirmationUrl) {
        window.open(result.confirmationUrl, "_top");
        onToast?.({
          tone: "info",
          message: "Complete billing approval in Shopify Admin",
        });
        return;
      }
      await refresh();
      onToast?.({
        tone: "success",
        message: `Plan updated to ${planId}`,
      });
    } catch (e) {
      onToast?.({ tone: "critical", message: e.message });
    } finally {
      setSubscribing("");
    }
  };

  if (loading) {
    return (
      <Card>
        <Text as="p">Loading plan…</Text>
      </Card>
    );
  }

  const { plan, usage, meters, catalog, billingTestMode, devPlanSwitch } =
    planData ?? {};

  return (
    <BlockStack gap="400">
      {billingTestMode && (
        <Banner tone="info" title="Billing test mode">
          Charges are created as test subscriptions until you deploy with live
          billing.
        </Banner>
      )}

      {devPlanSwitch && (
        <Banner tone="warning" title="Dev plan switch enabled">
          ALLOW_DEV_PLAN_SWITCH=true — upgrades apply instantly without Shopify
          billing.
        </Banner>
      )}

      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                {plan?.name ?? "Free"} plan
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Usage resets monthly · {usage?.month}
              </Text>
            </BlockStack>
            <Badge tone={plan?.id === "pro" ? "success" : "info"}>
              {plan?.id ?? "free"}
            </Badge>
          </InlineStack>

          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Collections sorted (this month)
              </Text>
              <ProgressBar
                progress={meterPercent(
                  usage?.collectionsSorted ?? 0,
                  meters?.collections?.limit ?? 1,
                )}
                size="small"
              />
              <Text as="p" variant="bodySm" tone="subdued">
                {usage?.collectionsSorted ?? 0} /{" "}
                {meters?.collections?.limit ?? "—"}
              </Text>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Orders scanned for sales sort
              </Text>
              <ProgressBar
                progress={meterPercent(
                  usage?.ordersScanned ?? 0,
                  meters?.orders?.limit ?? 1,
                )}
                size="small"
              />
              <Text as="p" variant="bodySm" tone="subdued">
                {usage?.ordersScanned ?? 0} / {meters?.orders?.limit ?? "—"}
              </Text>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Per-collection rule overrides
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Up to {meters?.collectionRules?.limit ?? "—"} overrides on{" "}
                {plan?.name}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Sort runs this month: {usage?.sortsRun ?? 0}
              </Text>
            </BlockStack>
          </InlineGrid>
        </BlockStack>
      </Card>

      <Box>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {(catalog ?? []).map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              currentPlanId={plan?.id}
              onSelect={handleSelect}
              loading={subscribing === p.id}
            />
          ))}
        </InlineGrid>
      </Box>

      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Feature access on your plan
          </Text>
          <Divider />
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="200">
            {Object.entries(plan?.features ?? {}).map(([key, enabled]) => (
              <Text
                as="p"
                key={key}
                variant="bodySm"
                tone={enabled ? undefined : "subdued"}
              >
                {enabled ? "✓" : "—"}{" "}
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </Text>
            ))}
          </InlineGrid>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
