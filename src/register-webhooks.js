import "./load-env.js";
import { createShopifyClient } from "./shopify.js";
import {
  migrateLegacyEnvInstall,
  resolveShopAccessToken,
} from "./shop-auth.js";
import { isShopInstalled, listInstalledShops } from "./shop-store.js";

function publicUrl(path) {
  const base =
    process.env.PUBLIC_URL?.trim()?.replace(/\/$/, "") || null;
  return base ? `${base}${path}` : null;
}

const WEBHOOKS = [
  {
    topic: "INVENTORY_ITEMS_UPDATE",
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

async function listExistingWebhooks(client) {
  const data = await client.graphql(
    `query WebhookSubscriptions {
      webhookSubscriptions(first: 50) {
        edges {
          node {
            id
            topic
            endpoint {
              ... on WebhookHttpEndpoint { callbackUrl }
            }
          }
        }
      }
    }`,
  );

  return (data.webhookSubscriptions?.edges ?? []).map((edge) => edge.node);
}

async function registerWebhook(client, topic, url, existing = []) {
  const already = existing.find(
    (sub) =>
      sub.topic === topic &&
      sub.endpoint?.callbackUrl === url,
  );
  if (already) {
    return { id: already.id, topic: already.topic, existing: true };
  }

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
    const message = errors.map((e) => e.message).join(", ");
    if (message.includes("already been taken")) {
      const match = existing.find((sub) => sub.endpoint?.callbackUrl === url);
      if (match) {
        return { id: match.id, topic: match.topic, existing: true };
      }
    }
    throw new Error(message);
  }

  return data.webhookSubscriptionCreate.webhookSubscription;
}

function resolveTargetShops() {
  const fromEnv = process.env.SHOPIFY_STORE?.trim();
  if (fromEnv) {
    if (!isShopInstalled(fromEnv)) {
      throw new Error(
        `App not installed for ${fromEnv}. Open /auth?shop=${fromEnv} first.`,
      );
    }
    return [fromEnv];
  }

  const installed = listInstalledShops().map((record) => record.shop);
  if (!installed.length) {
    throw new Error(
      "No installed shops found. Install the app first or set SHOPIFY_STORE in .env.",
    );
  }
  return installed;
}

async function registerForShop(store) {
  const token = await resolveShopAccessToken(store);
  const client = createShopifyClient({ store, accessToken: token });
  const existing = await listExistingWebhooks(client);

  console.log(`\n==> ${store}`);
  for (const hook of WEBHOOKS) {
    const sub = await registerWebhook(client, hook.topic, hook.url, existing);
    const status = sub.existing ? "Already registered" : "Registered";
    console.log(`${status} ${hook.label} webhook (${hook.topic}):`);
    console.log(JSON.stringify(sub, null, 2));
    console.log(`Callback: ${hook.url}`);
  }
}

async function main() {
  const missing = WEBHOOKS.filter((w) => !w.url);
  if (missing.length) {
    throw new Error(
      "Set PUBLIC_URL (or WEBHOOK_URL / BILLING_WEBHOOK_URL) in .env — must be public HTTPS",
    );
  }

  migrateLegacyEnvInstall();
  const shops = resolveTargetShops();

  for (const store of shops) {
    await registerForShop(store);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
