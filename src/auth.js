export const DEFAULT_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
].join(",");

export function normalizeShop(store) {
  return store.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function postTokenRequest(store, params) {
  const shop = normalizeShop(store);
  const url = `https://${shop}/admin/oauth/access_token`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Token request failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
    );
  }

  if (!response.ok) {
    const detail =
      json.error_description ?? json.error ?? text.slice(0, 300);
    throw new Error(`Token request failed (HTTP ${response.status}): ${detail}`);
  }

  if (!json.access_token) {
    throw new Error("Token response missing access_token");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? "",
    expiresIn: json.expires_in ?? null,
    refreshTokenExpiresIn: json.refresh_token_expires_in ?? null,
  };
}

/**
 * Dev Dashboard org stores only.
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 */
export async function fetchClientCredentialsToken({ store, clientId, clientSecret }) {
  return postTokenRequest(store, {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
}

/**
 * After OAuth install (production / any installed store).
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */
export async function exchangeAuthorizationCode({
  store,
  clientId,
  clientSecret,
  code,
  expiring = "1",
}) {
  return postTokenRequest(store, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    expiring,
  });
}

/** Migrate a legacy non-expiring offline token to an expiring one. */
export async function exchangeForExpiringOfflineToken({
  store,
  clientId,
  clientSecret,
  offlineAccessToken,
}) {
  return postTokenRequest(store, {
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    client_id: clientId,
    client_secret: clientSecret,
    subject_token: offlineAccessToken,
    subject_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    requested_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    expiring: "1",
  });
}

/**
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
 */
export async function refreshAccessToken({
  store,
  clientId,
  clientSecret,
  refreshToken,
}) {
  return postTokenRequest(store, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

export function buildAuthorizeUrl({
  store,
  clientId,
  redirectUri,
  scopes = DEFAULT_SCOPES,
  state,
}) {
  const shop = normalizeShop(store);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

const PRODUCTION_STORE_HINT =
  "Run `npm run auth:install` once, then add SHOPIFY_ACCESS_TOKEN to .env and GitHub secrets.";

export async function resolveAccessToken(store) {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const refreshToken = process.env.SHOPIFY_REFRESH_TOKEN?.trim();
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();

  if (refreshToken && clientId && clientSecret) {
    console.log("Refreshing access token (refresh_token grant)…");
    const token = await refreshAccessToken({
      store,
      clientId,
      clientSecret,
      refreshToken,
    });
    console.log(
      `Token refreshed (expires in ${token.expiresIn ?? "unknown"}s, scope: ${token.scope})`,
    );
    return token.accessToken;
  }

  if (accessToken) {
    console.log("Using SHOPIFY_ACCESS_TOKEN…");
    return accessToken;
  }

  if (clientId && clientSecret) {
    console.log("Authenticating with Client ID + Secret (client credentials)…");
    try {
      const token = await fetchClientCredentialsToken({
        store,
        clientId,
        clientSecret,
      });
      console.log(
        `Token acquired (expires in ${token.expiresIn ?? "unknown"}s, scope: ${token.scope})`,
      );
      return token.accessToken;
    } catch (err) {
      if (
        err.message.includes("cannot be performed on this shop") ||
        err.message.includes("shop_not_permitted")
      ) {
        throw new Error(
          `This store does not support client credentials (typical for production stores outside your Dev Dashboard org). ${PRODUCTION_STORE_HINT}`,
        );
      }
      throw err;
    }
  }

  throw new Error(
    `Missing auth credentials. Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, or complete OAuth install. ${PRODUCTION_STORE_HINT}`,
  );
}
