import { useMemo, useState } from "react";
import { BlockStack, Checkbox, Text, TextField } from "@shopify/polaris";

export default function CollectionPicker({
  label,
  helpText,
  selected = [],
  onChange,
  collections = [],
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q),
    );
  }, [collections, filter]);

  const toggle = (handle, checked) => {
    if (checked) {
      onChange([...new Set([...selected, handle])]);
    } else {
      onChange(selected.filter((h) => h !== handle));
    }
  };

  return (
    <BlockStack gap="200">
      <TextField
        label={label}
        value={filter}
        onChange={setFilter}
        placeholder="Search collections…"
        helpText={helpText}
        autoComplete="off"
      />
      {selected.length > 0 && (
        <Text as="p" tone="subdued">
          {selected.length} selected
        </Text>
      )}
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          border: "1px solid var(--p-color-border)",
          borderRadius: 8,
          padding: 8,
        }}
      >
        <BlockStack gap="100">
          {filtered.map((c) => (
            <Checkbox
              key={c.handle}
              label={`${c.title} (${c.handle})`}
              checked={selected.includes(c.handle)}
              onChange={(v) => toggle(c.handle, v)}
            />
          ))}
          {filtered.length === 0 && (
            <Text as="p" tone="subdued">
              No collections match
            </Text>
          )}
        </BlockStack>
      </div>
    </BlockStack>
  );
}
