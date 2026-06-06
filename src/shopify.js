const API_VERSION = "2025-01";
const MAX_RETRIES = 5;
const JOB_POLL_MS = 800;
const JOB_MAX_POLLS = 120;

export function createShopifyClient({ store, accessToken }) {
  const shop = store.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const endpoint = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;

  async function graphql(query, variables = {}) {
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (response.status === 429 || response.status >= 500) {
        const wait = Math.min(1000 * 2 ** attempt, 15000);
        await sleep(wait);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`,
        );
      }

      const errors = Array.isArray(json.errors)
        ? json.errors
        : json.errors
          ? [json.errors]
          : [];

      if (errors.length) {
        const throttled = errors.some(
          (e) =>
            e.message?.includes("Throttled") ||
            e.extensions?.code === "THROTTLED",
        );
        if (throttled && attempt < MAX_RETRIES - 1) {
          await sleep(Math.min(1000 * 2 ** attempt, 15000));
          continue;
        }
        throw new Error(errors.map((e) => e.message ?? String(e)).join("; "));
      }

      const cost = json.extensions?.cost;
      if (cost?.throttleStatus?.currentlyAvailable < 100) {
        await sleep(500);
      }

      return json.data;
    }

    throw lastError ?? new Error("GraphQL request failed after retries");
  }

  async function paginate(query, extract, variables = {}) {
    const items = [];
    let cursor = null;

    do {
      const data = await graphql(query, { ...variables, after: cursor });
      const page = extract(data);
      items.push(...page.nodes);
      cursor = page.hasNextPage ? page.endCursor : null;
    } while (cursor);

    return items;
  }

  async function waitForJob(jobId) {
    for (let i = 0; i < JOB_MAX_POLLS; i++) {
      const data = await graphql(
        `query JobStatus($id: ID!) {
          job(id: $id) {
            id
            done
          }
        }`,
        { id: jobId },
      );

      if (data.job?.done) {
        return;
      }
      await sleep(JOB_POLL_MS);
    }

    throw new Error(`Job ${jobId} did not complete in time`);
  }

  return { graphql, paginate, waitForJob };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
