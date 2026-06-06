import { PlanError } from "./plan-guard.js";

export function respondWithError(res, err, fallbackStatus = 500) {
  if (err instanceof PlanError) {
    return res.status(402).json({
      error: err.message,
      code: err.code,
      upgradePlan: err.upgradePlan,
    });
  }

  return res.status(fallbackStatus).json({ error: err.message });
}
