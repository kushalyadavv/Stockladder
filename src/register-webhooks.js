import "./load-env.js";
import { createShopifyClient } from "./shopify.js";
import {
  migrateLegacyEnvInstall,
  resolveShopAccessToken,
} from "./shop-auth.js";
import { isShopInstalled } from "./shop-store.js";

function publicUrl(path) {
  const base =
    process.env.PUBLIC_URL?.trim()?.replace(/\/$/, "") || null;
  return base ? `${base}${path}` : null;
}

const WEBHOOKS = [
  {
    topic: "INVENTORY_LEVELS_UPDATE",
    url:
      process.env.WEBHOOK_URL?.trim() ||
      publicUrl("/api/webhooks/inventory"),
    label: "inventory",
  },
  {
    topic: "APP_SUBSCRIPTIONS_UPDATE",
    url:
      process.env.BILLING_WEBHOOK_URL?.trim() ||
      publicUrl("/api/webhooks/billing"),
    label: "billing",
  },
  {
    topic: "APP_UNINSTALLED",
    url:
      process.env.UNINSTALL_WEBHOOK_URL?.trim() ||
      publicUrl("/api/webhooks/uninstall"),
    label: "uninstall",
  },
];

async function registerWebhook(client, topic, url) {
  const data = await client.graphql(
    `mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $url: URL!) {
      webhookSubscriptionCreate(
        topic: $topic
        webhookSubscription: { callbackUrl: $url, format: JSON }
      ) {
        webhookSubscription { id topic }
        userErrors { message }
      }
    }`,
    { topic, url },
  );

  const errors = data.webhookSubscriptionCreate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  return data.webhookSubscriptionCreate.webhookSubscription;
}

async function main() {
  const missing = WEBHOOKS.filter((w) => !w.url);
  if (missing.length) {
    throw new Error(
      "Set PUBLIC_URL (or WEBHOOK_URL / BILLING_WEBHOOK_URL) in .env — must be public HTTPS",
    );
  }

  migrateLegacyEnvInstall();
  const store = process.env.SHOPIFY_STORE?.trim();
  if (!store || !isShopInstalled(store)) {
    throw new Error(
      "Install the app first (open /auth?shop=your-store.myshopify.com)",
    );
  }
  const token = await resolveShopAccessToken(store);
  const client = createShopifyClient({ store, accessToken: token });

  for (const hook of WEBHOOKS) {
    const sub = await registerWebhook(client, hook.topic, hook.url);
    console.log(`Registered ${hook.label} webhook:`);
    console.log(JSON.stringify(sub, null, 2));
    console.log(`Callback: ${hook.url}\n`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
