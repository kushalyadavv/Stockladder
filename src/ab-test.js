import { computeDesiredOrder } from "./order.js";
import { enrichSortConfig } from "./sort-context.js";
import { fetchCollectionProducts } from "./sort.js";
import { getSalesMetric } from "./sales.js";
import { getGa4Metric } from "./ga4.js";

function variantLabel(variant) {
  return variant.name || variant.sortStrategy || variant.withinTierSort || "variant";
}

function buildPreviewRow(product, pos, config) {
  const sales = config.salesMetrics
    ? getSalesMetric(
        product.id,
        config.salesMetrics,
        config.withinTierSort === "sales_revenue" ? "revenue" : "units",
      )
    : null;

  return {
    pos,
    id: product.id,
    title: product.title,
    handle: product.handle,
    inventory: product.totalInventory ?? 0,
    sales,
    ga4Views: config.ga4Metrics
      ? getGa4Metric(product.handle, config.ga4Metrics, "views")
      : null,
  };
}

export async function compareAbVariants(
  client,
  collection,
  variantA,
  variantB,
  baseConfig,
  planContext = null,
) {
  const products = await fetchCollectionProducts(client, collection.id);
  const beforeIds = products.map((p) => p.id);

  const configA = await enrichSortConfig(
    client,
    collection,
    {
      ...baseConfig,
      ...variantA,
      sortStrategy: variantA.sortStrategy ?? baseConfig.sortStrategy,
      withinTierSort: variantA.withinTierSort ?? baseConfig.withinTierSort,
    },
    planContext,
  );

  const configB = await enrichSortConfig(
    client,
    collection,
    {
      ...baseConfig,
      ...variantB,
      sortStrategy: variantB.sortStrategy ?? baseConfig.sortStrategy,
      withinTierSort: variantB.withinTierSort ?? baseConfig.withinTierSort,
    },
    planContext,
  );

  const orderA = computeDesiredOrder(products, configA);
  const orderB = computeDesiredOrder(products, configB);

  const indexA = new Map(orderA.map((id, i) => [id, i]));
  const indexB = new Map(orderB.map((id, i) => [id, i]));

  let differences = 0;
  for (const p of products) {
    if (indexA.get(p.id) !== indexB.get(p.id)) differences++;
  }

  const topA = orderA.slice(0, 10).map((id, i) => {
    const p = products.find((x) => x.id === id);
    return p ? buildPreviewRow(p, i + 1, configA) : { pos: i + 1, id };
  });

  const topB = orderB.slice(0, 10).map((id, i) => {
    const p = products.find((x) => x.id === id);
    return p ? buildPreviewRow(p, i + 1, configB) : { pos: i + 1, id };
  });

  const warnings = [
    ...(configA._warnings ?? []),
    ...(configB._warnings ?? []),
  ].filter(Boolean);

  return {
    warnings: [...new Set(warnings)],
    collection: {
      handle: collection.handle,
      title: collection.title,
      productCount: products.length,
    },
    variantA: {
      label: variantLabel(variantA),
      config: {
        sortStrategy: configA.sortStrategy,
        withinTierSort: configA.withinTierSort,
        salesLookbackDays: configA.salesLookbackDays,
      },
      movesNeeded: products.filter((p, i) => indexA.get(p.id) !== i).length,
      top: topA,
    },
    variantB: {
      label: variantLabel(variantB),
      config: {
        sortStrategy: configB.sortStrategy,
        withinTierSort: configB.withinTierSort,
        salesLookbackDays: configB.salesLookbackDays,
      },
      movesNeeded: products.filter((p, i) => indexB.get(p.id) !== i).length,
      top: topB,
    },
    differences,
    unchangedFromCurrent: {
      a: orderA.filter((id, i) => id === beforeIds[i]).length,
      b: orderB.filter((id, i) => id === beforeIds[i]).length,
    },
  };
}
