import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import App from "./App.jsx";
import EmbeddedShell from "./EmbeddedShell.jsx";
import PrivacyPage from "./PrivacyPage.jsx";

const path =
  window.location.pathname.replace(/\/$/, "") || "/";
const search = new URLSearchParams(window.location.search);
const host = search.get("host");
const apiKey = import.meta.env.VITE_SHOPIFY_CLIENT_ID?.trim();
const embedded = Boolean(host && apiKey);

function loadAppBridgeScript() {
  if (window.shopify) return Promise.resolve();

  let meta = document.querySelector('meta[name="shopify-api-key"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "shopify-api-key";
    meta.content = apiKey;
    document.head.appendChild(meta);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src*="app-bridge.js"]',
    );
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function mount() {
  const root = createRoot(document.getElementById("root"));

  if (path === "/privacy") {
    root.render(<PrivacyPage />);
    return;
  }

  if (embedded) {
    await loadAppBridgeScript();
  }

  const app = <App embedded={embedded} />;

  root.render(
    <AppProvider i18n={en}>
      {embedded ? <EmbeddedShell>{app}</EmbeddedShell> : app}
    </AppProvider>,
  );
}

mount().catch((err) => {
  console.error("Failed to mount app:", err);
});
