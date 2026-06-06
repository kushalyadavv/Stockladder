import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { shopDir, shopFile } from "./shop-data-path.js";

function ga4Path() {
  return shopFile("ga4-metrics.json");
}

export function loadGa4Metrics() {
  const GA4_PATH = ga4Path();
  if (!existsSync(GA4_PATH)) {
    return { importedAt: null, products: {} };
  }
  return JSON.parse(readFileSync(GA4_PATH, "utf8"));
}

export function saveGa4Metrics(payload) {
  const GA4_PATH = ga4Path();
  mkdirSync(shopDir(), { recursive: true });
  const entry = {
    importedAt: new Date().toISOString(),
    propertyId: payload.propertyId ?? null,
    products: payload.products ?? {},
  };
  writeFileSync(GA4_PATH, `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

export function parseGa4Rows(rows) {
  const products = {};

  for (const row of rows) {
    const handle =
      row.handle ??
      row.product_handle ??
      row.productHandle ??
      row["Product handle"];
    if (!handle) continue;

    const views = Number(
      row.views ?? row.pageViews ?? row.page_views ?? row["Views"] ?? 0,
    );
    const atc = Number(
      row.atc ??
        row.atc_rate ??
        row.addToCarts ??
        row.add_to_carts ??
        row["Add to carts"] ??
        0,
    );

    products[String(handle).trim()] = {
      views,
      atc,
      atcRate: views > 0 ? atc / views : 0,
    };
  }

  return products;
}

export function parseGa4Csv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return {};

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });

  return parseGa4Rows(rows);
}

export function buildGa4RankMap(metrics, field = "views") {
  const entries = Object.entries(metrics.products ?? {}).sort((a, b) => {
    const av = field === "atcRate" ? a[1].atcRate : a[1][field] ?? 0;
    const bv = field === "atcRate" ? b[1].atcRate : b[1][field] ?? 0;
    return bv - av;
  });

  return new Map(entries.map(([handle], i) => [handle, i]));
}

export function getGa4Metric(productHandle, metrics, field = "views") {
  const row = metrics?.products?.[productHandle];
  if (!row) return 0;
  if (field === "atcRate") return row.atcRate ?? 0;
  return row[field] ?? 0;
}
