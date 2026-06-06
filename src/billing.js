import { getPlan, PLANS } from "./plans.js";
import { setShopPlan } from "./shop-store.js";

const SUBSCRIPTION_CREATE = `mutation AppSubscriptionCreate(
  $name: String!
  $returnUrl: URL!
  $trialDays: Int
  $test: Boolean
  $lineItems: [AppSubscriptionLineItemInput!]!
) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    trialDays: $trialDays
    test: $test
    lineItems: $lineItems
  ) {
    confirmationUrl
    appSubscription {
      id
      status
      trialDays
    }
    userErrors { field message }
  }
}`;

const ACTIVE_SUBSCRIPTIONS = `query ActiveSubscriptions {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      trialDays
      lineItems {
        plan {
          pricingDetails {
            ... on AppRecurringPricing {
              price { amount currencyCode }
              interval
            }
          }
        }
      }
    }
  }
}`;

function billingTestMode() {
  return (
    process.env.SHOPIFY_BILLING_TEST === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function appBaseUrl() {
  return (
    process.env.PUBLIC_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    `http://localhost:${process.env.PORT ?? 3001}`
  );
}

export function mapSubscriptionNameToPlan(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("pro")) return "pro";
  if (lower.includes("growth")) return "growth";
  return "free";
}

export async function fetchActiveSubscriptions(client) {
  const data = await client.graphql(ACTIVE_SUBSCRIPTIONS, {});
  return data.currentAppInstallation?.activeSubscriptions ?? [];
}

export async function syncPlanFromShopify(client, shop) {
  const subs = await fetchActiveSubscriptions(client);
  const active = subs.find((s) =>
    ["ACTIVE", "ACCEPTED", "PENDING"].includes(s.status),
  );

  if (!active) {
    return setShopPlan(shop, "free", {
      subscriptionId: null,
      subscriptionStatus: null,
    });
  }

  const planId = mapSubscriptionNameToPlan(active.name);
  return setShopPlan(shop, planId, {
    subscriptionId: active.id,
    subscriptionStatus: active.status,
  });
}

export async function createPaidSubscription(client, shop, planId) {
  const plan = getPlan(planId);
  if (!plan.price) {
    return setShopPlan(shop, "free", {
      subscriptionId: null,
      subscriptionStatus: null,
    });
  }

  if (process.env.ALLOW_DEV_PLAN_SWITCH === "true") {
    return setShopPlan(shop, planId, {
      subscriptionId: `dev-${planId}`,
      subscriptionStatus: "ACTIVE",
    });
  }

  const returnUrl = `${appBaseUrl()}/api/billing/callback?shop=${encodeURIComponent(shop)}&plan=${planId}`;
  const data = await client.graphql(SUBSCRIPTION_CREATE, {
    name: `Stockladder ${plan.name}`,
    returnUrl,
    trialDays: plan.trialDays || null,
    test: billingTestMode(),
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: plan.price, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  });

  const result = data.appSubscriptionCreate;
  const errors = result?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  if (result?.appSubscription?.id) {
    setShopPlan(shop, planId, {
      subscriptionId: result.appSubscription.id,
      subscriptionStatus: result.appSubscription.status,
    });
  }

  return {
    confirmationUrl: result.confirmationUrl,
    subscription: result.appSubscription,
  };
}

export function handleSubscriptionWebhook(shop, payload) {
  const status = payload?.app_subscription?.status;
  const name = payload?.app_subscription?.name;
  const id = payload?.app_subscription?.admin_graphql_api_id;

  if (!shop) return { handled: false, reason: "no_shop" };

  if (status === "ACTIVE" || status === "ACCEPTED") {
    const planId = mapSubscriptionNameToPlan(name);
    setShopPlan(shop, planId, {
      subscriptionId: id,
      subscriptionStatus: status,
    });
    return { handled: true, planId, status };
  }

  if (status === "CANCELLED" || status === "DECLINED" || status === "EXPIRED") {
    setShopPlan(shop, "free", {
      subscriptionId: null,
      subscriptionStatus: status,
    });
    return { handled: true, planId: "free", status };
  }

  return { handled: false, status };
}

export { PLANS, billingTestMode, appBaseUrl };
