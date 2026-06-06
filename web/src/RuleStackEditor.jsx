import { useEffect, useState } from "react";
import {
  BlockStack,
  Button,
  InlineStack,
  Text,
  Badge,
} from "@shopify/polaris";
import { api } from "./api.js";

export default function RuleStackEditor({ stack, onChange, disabled = false }) {
  const [catalog, setCatalog] = useState({});

  useEffect(() => {
    api
      .getRuleCatalog()
      .then(setCatalog)
      .catch(() => setCatalog({}));
  }, []);

  const rules = stack ?? [];

  const move = (index, direction) => {
    const next = [...rules];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const add = (ruleId) => {
    if (rules.includes(ruleId)) return;
    onChange([...rules, ruleId]);
  };

  const available = Object.keys(catalog).filter((id) => !rules.includes(id));

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Products are grouped into tiers in this order. Within each tier, the
        within-tier sort applies (inventory, date, bestseller, etc.).
      </Text>

      {rules.length === 0 ? (
        <Text as="p" tone="subdued">
          No rules enabled — add tiers below.
        </Text>
      ) : (
        rules.map((ruleId, index) => (
          <InlineStack key={ruleId} gap="200" blockAlign="center" wrap={false}>
            <Text as="span" variant="bodySm">
              {index + 1}.
            </Text>
            <Badge>{catalog[ruleId] ?? ruleId}</Badge>
            <Button
              size="slim"
              onClick={() => move(index, -1)}
              disabled={disabled || index === 0}
            >
              ↑
            </Button>
            <Button
              size="slim"
              onClick={() => move(index, 1)}
              disabled={disabled || index === rules.length - 1}
            >
              ↓
            </Button>
            <Button
              size="slim"
              tone="critical"
              onClick={() => remove(index)}
              disabled={disabled}
            >
              Remove
            </Button>
          </InlineStack>
        ))
      )}

      {available.length > 0 && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Add tier
          </Text>
          <InlineStack gap="200" wrap>
            {available.map((ruleId) => (
              <Button
                key={ruleId}
                size="slim"
                onClick={() => add(ruleId)}
                disabled={disabled}
              >
                + {catalog[ruleId] ?? ruleId}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>
      )}
    </BlockStack>
  );
}
