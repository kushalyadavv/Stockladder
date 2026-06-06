import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  normalizeShop,
  refreshAccessToken,
} from "./auth.js";
import {
  getShopRecord,
  isShopInstalled,
  saveShopAuth,
  saveShopRecord,
} from "./shop-store.js";
import { verifySessionToken } from "./session-token.js";

const OAUTH_STATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "oauth-states.json",
);

const STATE_TTL_MS = 10 * 60 * 1000;

export const APP_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "read_orders",
].join(",");

function clientId() {
  const id = process.env.SHOPIFY_CLIENT_ID?.trim();
  if (!id) throw new Error("SHOPIFY_CLIENT_ID missing");
  return id;
}

function clientSecret() {
  const secret =
    process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) throw new Error("SHOPIFY_CLIENT_SECRET missing");
  return secret;
}

export function appBaseUrl() {
  const base =
    process.env.PUBLIC_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    `http://localhost:${process.env.PORT ?? 3001}`;
  return base.replace(/\/$/, "");
}

export function oauthRedirectUri() {
  return (
    process.env.SHOPIFY_REDIRECT_URI?.trim() ||
    `${appBaseUrl()}/auth/callback`
  );
}

function loadOAuthStates() {
  if (!existsSync(OAUTH_STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(OAUTH_STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveOAuthStates(states) {
  mkdirSync(dirname(OAUTH_STATE_PATH), { recursive: true });
  writeFileSync(OAUTH_STATE_PATH, `${JSON.stringify(states, null, 2)}\n`);
}

function pruneOAuthStates(states) {
  const now = Date.now();
  const next = {};
  for (const [key, value] of Object.entries(states)) {
    if (value?.createdAt && now - value.createdAt < STATE_TTL_MS) {
      next[key] = value;
    }
  }
  return next;
}

function createOAuthState(shop) {
  const states = pruneOAuthStates(loadOAuthStates());
  const state = randomBytes(16).toString("hex");
  states[state] = {
    shop: normalizeShop(shop),
    createdAt: Date.now(),
  };
  saveOAuthStates(states);
  return state;
}

function consumeOAuthState(state, shop) {
  const states = pruneOAuthStates(loadOAuthStates());
  const entry = states[state];
  delete states[state];
  saveOAuthStates(states);

  if (!entry) {
    throw new Error("OAuth state expired or invalid");
  }

  if (entry.shop !== normalizeShop(shop)) {
    throw new Error("OAuth state shop mismatch");
  }

  return entry.shop;
}

export function isValidShopDomain(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(normalizeShop(shop));
}

export function buildInstallUrl(shop) {
  if (!isValidShopDomain(shop)) {
    throw new Error("Invalid shop domain");
  }

  const state = createOAuthState(shop);
  return buildAuthorizeUrl({
    store: shop,
    clientId: clientId(),
    redirectUri: oauthRedirectUri(),
    scopes: APP_SCOPES,
    state,
  });
}

export async function completeOAuthCallback({ shop, code, state }) {
  const normalized = consumeOAuthState(state, shop);
  const token = await exchangeAuthorizationCode({
    store: normalized,
    clientId: clientId(),
    clientSecret: clientSecret(),
    code,
    expiring: "0",
  });

  saveShopAuth(normalized, {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    scope: token.scope,
    expiresIn: token.expiresIn,
  });

  return { shop: normalized, scope: token.scope };
}

export function embeddedAppUrl(shop) {
  const normalized = normalizeShop(shop);
  const host = Buffer.from(`${normalized}/admin`, "utf8").toString("base64");
  return `${appBaseUrl()}/?shop=${encodeURIComponent(normalized)}&host=${encodeURIComponent(host)}`;
}

export async function resolveShopAccessToken(shop) {
  const normalized = normalizeShop(shop);
  const record = getShopRecord(normalized);

  if (record.accessToken) {
    if (record.refreshToken) {
      const expiresAt = record.tokenExpiresAt
        ? Date.parse(record.tokenExpiresAt)
        : null;
      const shouldRefresh =
        !expiresAt || expiresAt - Date.now() < 5 * 60 * 1000;

      if (shouldRefresh) {
        try {
          const token = await refreshAccessToken({
            store: normalized,
            clientId: clientId(),
            clientSecret: clientSecret(),
            refreshToken: record.refreshToken,
          });
          saveShopAuth(normalized, {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken ?? record.refreshToken,
            scope: token.scope ?? record.scope,
            expiresIn: token.expiresIn,
          });
          return token.accessToken;
        } catch (err) {
          console.warn(
            `[auth] refresh failed for ${normalized}: ${err.message}`,
          );
        }
      }
    }
    return record.accessToken;
  }

  return resolveLegacyEnvToken(normalized);
}

async function resolveLegacyEnvToken(shop) {
  const envShop = process.env.SHOPIFY_STORE?.trim();
  if (!envShop || normalizeShop(envShop) !== shop) {
    throw new Error(
      `App not installed for ${shop}. Open /auth?shop=${shop} to install.`,
    );
  }

  const { resolveAccessToken } = await import("./auth.js");
  const token = await resolveAccessToken(shop);
  saveShopAuth(shop, { accessToken: token, scope: APP_SCOPES });
  return token;
}

export async function resolveRequestShop(req) {
  const authHeader = req.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (bearer) {
    const { shop } = verifySessionToken(bearer);
    return shop;
  }

  const headerShop = req.get("X-Shopify-Shop-Domain")?.trim();
  if (headerShop && isValidShopDomain(headerShop)) {
    return normalizeShop(headerShop);
  }

  const queryShop = req.query?.shop?.trim();
  if (queryShop && isValidShopDomain(queryShop)) {
    return normalizeShop(queryShop);
  }

  const bodyShop = req.body?.shop?.trim();
  if (bodyShop && isValidShopDomain(bodyShop)) {
    return normalizeShop(bodyShop);
  }

  const envShop = process.env.SHOPIFY_STORE?.trim();
  if (envShop && isShopInstalled(envShop)) {
    return normalizeShop(envShop);
  }

  if (envShop && process.env.ALLOW_LEGACY_SINGLE_TENANT !== "false") {
    return normalizeShop(envShop);
  }

  return null;
}

export function migrateLegacyEnvInstall() {
  const shop = process.env.SHOPIFY_STORE?.trim();
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  const refreshToken = process.env.SHOPIFY_REFRESH_TOKEN?.trim();

  if (!shop || !accessToken) return null;

  const record = getShopRecord(shop);
  if (record.accessToken) return null;

  saveShopAuth(shop, {
    accessToken,
    refreshToken: refreshToken || null,
    scope: process.env.SHOPIFY_SCOPES?.trim() || APP_SCOPES,
  });

  console.log(`[auth] Migrated legacy .env token for ${shop}`);
  return shop;
}

export { isShopInstalled };
