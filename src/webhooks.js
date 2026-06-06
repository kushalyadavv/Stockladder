import { createHmac, timingSafeEqual } from "node:crypto";
import { runSort } from "./engine.js";
import { getPlanContext } from "./shop-store.js";

const pendingTimers = new Map();

export function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
}

export function scheduleDebouncedSort(collectionHandles, debounceMs, onLog) {
  const key = collectionHandles.length
    ? collectionHandles.sort().join(",")
    : "__all__";

  if (pendingTimers.has(key)) {
    clearTimeout(pendingTimers.get(key));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      try {
        for (const handle of collectionHandles.length
          ? collectionHandles
          : [""]) {
          const result = await runSort({
            dryRun: false,
            collectionHandle: handle,
            onLog,
          });
          resolve(result);
        }
      } catch (err) {
        reject(err);
      }
    }, debounceMs);

    pendingTimers.set(key, timer);
  });
}

export async function handleInventoryWebhook(payload, config, onLog) {
  const inventoryItemId = payload.inventory_item_id;
  if (!inventoryItemId) {
    return { scheduled: false, reason: "no inventory_item_id" };
  }

  const { plan } = getPlanContext();
  if (!plan.features.webhooks) {
    onLog?.("Webhook ignored — Growth plan required for auto-sort webhooks");
    return { scheduled: false, reason: "plan_webhooks_required" };
  }

  onLog?.(`Webhook: inventory update for item ${inventoryItemId}`);

  const debounceMs = config.webhookDebounceMs ?? 90_000;

  scheduleDebouncedSort([], debounceMs, onLog);

  return {
    scheduled: true,
    debounceMs,
    note: "Full collection re-sort scheduled after debounce",
  };
}
