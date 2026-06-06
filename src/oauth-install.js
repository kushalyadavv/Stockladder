import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env.js";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  normalizeShop,
} from "./auth.js";
import { APP_SCOPES, oauthRedirectUri } from "./shop-auth.js";
import { saveShopAuth } from "./shop-store.js";

const PORT = Number(process.env.OAUTH_PORT ?? 3456);
const REDIRECT_URI =
  process.env.SHOPIFY_REDIRECT_URI ?? `http://localhost:${PORT}/callback`;
const SERVER_REDIRECT =
  process.env.PUBLIC_URL?.trim()
    ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/auth/callback`
    : oauthRedirectUri();
const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function upsertEnvFile(updates) {
  const lines = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split("\n")
    : [];
  const keys = new Set(Object.keys(updates));
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (keys.has(key)) {
      out.push(`${key}=${updates[key]}`);
      keys.delete(key);
    } else {
      out.push(line);
    }
  }

  for (const key of keys) {
    out.push(`${key}=${updates[key]}`);
  }

  writeFileSync(ENV_PATH, out.filter((l, i, a) => !(i === a.length - 1 && l === "")).join("\n") + "\n");
}

async function main() {
  const store = requireEnv("SHOPIFY_STORE");
  const clientId = requireEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requireEnv("SHOPIFY_CLIENT_SECRET");
  const shop = normalizeShop(store);
  const state = randomBytes(16).toString("hex");

  console.log("\n=== Shopify OAuth install (one-time) ===\n");
  console.log("Before continuing, add this URL in Dev Dashboard → your app →");
  console.log("Versions → URLs → Allowed redirection URL(s):\n");
  console.log(`  ${REDIRECT_URI}\n`);
  console.log("Scopes requested:", APP_SCOPES);
  console.log(`Multi-tenant callback (production): ${SERVER_REDIRECT}`);
  console.log(`Store: ${shop}\n`);

  const authorizeUrl = buildAuthorizeUrl({
    store: shop,
    clientId,
    redirectUri: REDIRECT_URI,
    state,
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`OAuth error: ${error}`);
      console.error(`OAuth error: ${error}`);
      server.close();
      process.exit(1);
      return;
    }

    if (!code || returnedState !== state) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid OAuth callback");
      console.error("Invalid OAuth callback (missing code or state mismatch)");
      server.close();
      process.exit(1);
      return;
    }

    try {
      const token = await exchangeAuthorizationCode({
        store: shop,
        clientId,
        clientSecret,
        code,
        expiring: "0",
      });

      saveShopAuth(shop, {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        scope: token.scope,
        expiresIn: token.expiresIn,
      });

      const updates = { SHOPIFY_ACCESS_TOKEN: token.accessToken };
      if (token.refreshToken) {
        updates.SHOPIFY_REFRESH_TOKEN = token.refreshToken;
      }
      upsertEnvFile(updates);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h1>Install complete</h1><p>You can close this tab and return to the terminal.</p>",
      );

      console.log("\nSuccess! Saved to data/shops/ and .env:");
      console.log("  SHOPIFY_ACCESS_TOKEN=...");
      if (token.refreshToken) {
        console.log("  SHOPIFY_REFRESH_TOKEN=...");
      }
      console.log(`\nScope: ${token.scope}`);
      console.log("\nNext: npm run sort:dry");
      console.log(
        "\nFor GitHub Actions, add SHOPIFY_ACCESS_TOKEN as a repository secret.\n",
      );

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Token exchange failed: ${err.message}`);
      console.error(err.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log("Open this URL in your browser and approve the install:\n");
    console.log(authorizeUrl);
    console.log(`\nWaiting for callback on ${REDIRECT_URI} …\n`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
