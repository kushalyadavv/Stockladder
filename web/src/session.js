const search = new URLSearchParams(window.location.search);

export function getShopFromUrl() {
  return search.get("shop")?.trim() || "";
}

export function getHostFromUrl() {
  return search.get("host")?.trim() || "";
}

export function isEmbedded() {
  return Boolean(getHostFromUrl() && import.meta.env.VITE_SHOPIFY_CLIENT_ID);
}

export async function getSessionToken() {
  if (window.shopify?.idToken) {
    return window.shopify.idToken();
  }
  return null;
}

export async function authHeaders() {
  const headers = {};
  const token = await getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const shop = getShopFromUrl();
  if (shop) {
    headers["X-Shopify-Shop-Domain"] = shop;
  }
  return headers;
}

export function withShopQuery(path) {
  const shop = getShopFromUrl();
  if (!shop || path.includes("shop=")) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}shop=${encodeURIComponent(shop)}`;
}
