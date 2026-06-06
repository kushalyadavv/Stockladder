import { AsyncLocalStorage } from "node:async_hooks";
import { normalizeShop } from "./auth.js";

export const requestContext = new AsyncLocalStorage();

export function getCurrentShop() {
  return requestContext.getStore()?.shop ?? null;
}

export function runWithShop(shop, fn) {
  const normalized = normalizeShop(shop);
  return requestContext.run({ shop: normalized }, fn);
}

export async function runWithShopAsync(shop, fn) {
  return runWithShop(shop, fn);
}
