import { effectiveInventory } from "./order.js";

const VARIANT_REORDER = `mutation VariantReorder($productId: ID!, $positions: [ProductVariantPositionInput!]!) {
  productVariantsBulkReorder(productId: $productId, positions: $positions) {
    product { id }
    userErrors { message }
  }
}`;

function variantQty(variant, config) {
  if (config.useOnlineInventory) {
    return variant.sellableOnlineQuantity ?? variant.inventoryQuantity ?? 0;
  }
  return variant.inventoryQuantity ?? 0;
}

export function sortedVariantPositions(variants, config) {
  if (!variants || variants.length < 2) return null;

  const withId = variants.filter((v) => v.id);
  if (withId.length < 2) return null;

  const direction = config.sortDirection === "asc" ? 1 : -1;
  const sorted = [...withId].sort((a, b) => {
    const qa = variantQty(a, config);
    const qb = variantQty(b, config);
    if (qa !== qb) return direction * (qa - qb);
    return (a.position ?? 0) - (b.position ?? 0);
  });

  const moves = [];
  for (let i = 0; i < sorted.length; i++) {
    const variant = sorted[i];
    const desiredPosition = i + 1;
    if ((variant.position ?? desiredPosition) !== desiredPosition) {
      moves.push({ id: variant.id, position: desiredPosition });
    }
  }

  return moves.length ? moves : null;
}

export async function sortProductVariants(
  client,
  product,
  config,
  dryRun,
) {
  const positions = sortedVariantPositions(product.variants, config);
  if (!positions) return 0;

  if (dryRun) return positions.length;

  const data = await client.graphql(VARIANT_REORDER, {
    productId: product.id,
    positions,
  });

  const errors = data.productVariantsBulkReorder?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  return positions.length;
}

export async function sortVariantsForProducts(
  client,
  products,
  config,
  dryRun,
) {
  if (!config.sortVariantsByInventory) return 0;

  let total = 0;
  for (const product of products) {
    if ((product.variants?.length ?? 0) < 2) continue;
    total += await sortProductVariants(client, product, config, dryRun);
  }
  return total;
}
