import { authHeaders, withShopQuery } from "./session.js";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...options.headers,
  };

  const res = await fetch(withShopQuery(path), {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.error || data.message || `Request failed (${res.status})`,
    );
    err.code = data.code;
    err.upgradePlan = data.upgradePlan;
    err.status = res.status;
    err.authUrl = data.authUrl;
    err.shop = data.shop;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  getRuleCatalog: () => request("/api/rule-catalog"),
  getConfig: () => request("/api/config"),
  saveConfig: (config) =>
    request("/api/config", { method: "PUT", body: JSON.stringify(config) }),
  getCollections: () => request("/api/collections"),
  getSnapshots: () => request("/api/snapshots"),
  diagnose: (handle) => request(`/api/diagnose/${handle}`),
  getRuns: () => request("/api/runs"),
  runSort: (body) =>
    request("/api/sort", { method: "POST", body: JSON.stringify(body) }),
  revert: (body = {}) =>
    request("/api/revert", { method: "POST", body: JSON.stringify(body) }),
  getAnalytics: (handle = "") =>
    request(handle ? `/api/analytics?handle=${handle}` : "/api/analytics"),
  getGa4: () => request("/api/ga4"),
  importGa4: (body) =>
    request("/api/ga4/import", { method: "POST", body: JSON.stringify(body) }),
  compareAb: (body) =>
    request("/api/ab/compare", { method: "POST", body: JSON.stringify(body) }),
  applyAb: (body) =>
    request("/api/ab/apply", { method: "POST", body: JSON.stringify(body) }),
  syncSeasonal: (body = {}) =>
    request("/api/seasonal/sync", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  syncSmart: (body = {}) =>
    request("/api/smart-sync", { method: "POST", body: JSON.stringify(body) }),
  getPlan: () => request("/api/plan"),
  subscribePlan: (planId) =>
    request("/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),
};
