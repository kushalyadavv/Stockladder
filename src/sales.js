const ORDERS_QUERY = `query Orders($first: Int!, $after: String, $query: String!) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        lineItems(first: 100) {
          edges {
            node {
              quantity
              product { id }
              discountedTotalSet { shopMoney { amount } }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ORDERS_PROBE = `query OrdersProbe {
  orders(first: 1) {
    edges { node { id } }
  }
}`;

const salesCache = new Map();

export const SALES_SCOPE_MESSAGE =
  "Sales sort needs read_orders scope. Dev Dashboard → add read_orders → release → npm run auth:install";

function cacheKey(days) {
  const day = new Date().toISOString().slice(0, 10);
  return `${day}:${days}`;
}

export function isOrdersAccessError(message = "") {
  return /access denied.*orders/i.test(message);
}

export function clearSalesCache() {
  salesCache.clear();
}

export async function probeOrdersAccess(client) {
  try {
    await client.graphql(ORDERS_PROBE, {});
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: isOrdersAccessError(err.message)
        ? SALES_SCOPE_MESSAGE
        : err.message,
    };
  }
}

function emptySalesResult(accessDenied = false, message = null) {
  return { metrics: new Map(), orderCount: 0, accessDenied, message };
}

export async function fetchProductSalesMetrics(client, days = 30) {
  const key = cacheKey(days);
  if (salesCache.has(key)) return salesCache.get(key);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const dateStr = since.toISOString().slice(0, 10);
  const query = `created_at:>=${dateStr} -status:cancelled`;

  const metrics = new Map();

  try {
    const orders = await client.paginate(
      ORDERS_QUERY,
      (data) => {
        const conn = data.orders;
        return {
          nodes: conn.edges.map((e) => e.node),
          hasNextPage: conn.pageInfo.hasNextPage,
          endCursor: conn.pageInfo.endCursor,
        };
      },
      { first: 50, query },
    );

    for (const order of orders) {
      for (const edge of order.lineItems?.edges ?? []) {
        const item = edge.node;
        const productId = item.product?.id;
        if (!productId) continue;

        const qty = item.quantity ?? 0;
        const revenue = Number(item.discountedTotalSet?.shopMoney?.amount ?? 0);

        const existing = metrics.get(productId) ?? { units: 0, revenue: 0 };
        existing.units += qty;
        existing.revenue += revenue;
        metrics.set(productId, existing);
      }
    }

    const result = {
      metrics,
      orderCount: orders.length,
      accessDenied: false,
      message: null,
    };
    salesCache.set(key, result);
    return result;
  } catch (err) {
    if (isOrdersAccessError(err.message)) {
      const result = emptySalesResult(true, SALES_SCOPE_MESSAGE);
      salesCache.set(key, result);
      return result;
    }
    throw err;
  }
}

export function buildSalesRankMap(metrics, metric = "units") {
  const entries = [...metrics.entries()].sort((a, b) => {
    const av = metric === "revenue" ? a[1].revenue : a[1].units;
    const bv = metric === "revenue" ? b[1].revenue : b[1].units;
    return bv - av;
  });

  return new Map(entries.map(([id], i) => [id, i]));
}

export function getSalesMetric(productId, metrics, metric = "units") {
  const row = metrics?.get(productId);
  if (!row) return 0;
  return metric === "revenue" ? row.revenue : row.units;
}
