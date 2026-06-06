import { requestContext } from "../../src/request-context.js";
import { ensureShopMigrated } from "../../src/shop-migrate.js";
import {
  isShopInstalled,
  resolveRequestShop,
} from "../../src/shop-auth.js";

export async function shopAuthMiddleware(req, res, next) {
  try {
    const shop = await resolveRequestShop(req);
    if (!shop) {
      return res.status(401).json({
        error: "Missing shop context",
        code: "SHOP_REQUIRED",
      });
    }

    if (!isShopInstalled(shop)) {
      return res.status(401).json({
        error: "App not installed for this shop",
        code: "AUTH_REQUIRED",
        shop,
        authUrl: `/auth?shop=${encodeURIComponent(shop)}`,
      });
    }

    ensureShopMigrated(shop);
    req.shop = shop;
    return requestContext.run({ shop }, () => next());
  } catch (err) {
    return res.status(401).json({
      error: err.message,
      code: "AUTH_INVALID",
    });
  }
}
