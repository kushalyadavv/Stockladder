import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeShop } from "./auth.js";

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function apiSecret() {
  return (
    process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim() ||
    ""
  );
}

function clientId() {
  return process.env.SHOPIFY_CLIENT_ID?.trim() || "";
}

export function shopFromDest(dest = "") {
  try {
    const url = new URL(dest);
    return normalizeShop(url.hostname);
  } catch {
    return normalizeShop(dest.replace(/\/admin.*$/, ""));
  }
}

export function verifySessionToken(token) {
  const secret = apiSecret();
  if (!token || !secret) {
    throw new Error("Session token or API secret missing");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid session token format");
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = base64UrlEncode(
    createHmac("sha256", secret)
      .update(`${headerPart}.${payloadPart}`)
      .digest(),
  );

  try {
    const sigOk = timingSafeEqual(
      Buffer.from(signaturePart),
      Buffer.from(expected),
    );
    if (!sigOk) throw new Error("Invalid session token signature");
  } catch (err) {
    if (err.message === "Invalid session token signature") throw err;
    throw new Error("Invalid session token signature");
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error("Session token expired");
  }

  const aud = clientId();
  if (aud && payload.aud && payload.aud !== aud) {
    throw new Error("Session token audience mismatch");
  }

  const shop = shopFromDest(payload.dest);
  if (!shop.endsWith(".myshopify.com")) {
    throw new Error("Session token missing valid shop");
  }

  return { shop, payload };
}
