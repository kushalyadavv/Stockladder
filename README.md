# Resort — Inventory collection sort

Automatically re-orders products in your Shopify **collections** so higher stock appears first and out-of-stock items sink to the bottom.

- **Cost:** $0 (GitHub Actions cron + Shopify Admin API; no paid hosting)
- **Runs:** Hourly + nightly (UTC), via GitHub Actions, or from the **web dashboard**
- **Dashboard:** React + Shopify Polaris UI for settings, preview, and one-click sort

## How it works

1. Loads all collections (or a subset via `config.json`).
2. Optionally sets each collection’s sort order to **Manual** (required for reordering).
3. Sorts products: untracked inventory → top, in-stock by quantity (high → low), out-of-stock → bottom.
4. Applies changes with Shopify’s `collectionReorderProducts` mutation (batched, with job polling).

## Web dashboard (recommended)

Control everything from a proper admin UI:

```bash
npm install
npm run dev
```

Open **http://localhost:5173** (API on port 3001).

### Dashboard features (Tier 1)

- **Strategy presets** — full inventory sort, OOS-bottom-only, best-selling then inventory
- **Pin products** — tag `featured` or `pin-top` stays at top
- **Deprioritize collections** — multi-select picker (accessories stay at bottom)
- **OOS: push down or hide** — remove sold-out from collection entirely
- **Online sellable qty** — use fulfillment-enabled stock instead of total inventory
- **Snapshots + revert** — full order saved before every live sort; one-click undo
- **Webhooks** — real-time resort on inventory changes (`npm run webhooks:register`)
- **Dry run / preview / run history**

### Dashboard features (Tier 3)

- **Sales / revenue sort** — order by units or revenue in last 7/30/90 days (`read_orders` scope)
- **GA4 metrics import** — paste CSV export; sort by page views or ATC rate
- **Collection analytics** — position-change history after each live sort
- **A/B strategy compare** — side-by-side preview; apply winning variant
- **Seasonal collections** — auto-build top-seller collections for date ranges
- **Smart collection mirrors** — sync smart collection → manual sorted mirror

### Dashboard features (Tier 2)

- **Multi-rule stack** — drag tiers (pinned → promoted → in-stock → low-stock → demoted → OOS)
- **Per-collection overrides** — skip `sale`, custom strategy on `new-in`, etc.
- **Low-stock band** — separate tier for products with ≤ N units (urgency merchandising)
- **Tag / vendor promote & demote** — boost `new-drop`, sink `clearance`
- **Variant swatch sort** — reorder size/color variants by inventory on each product
- **Embedded Shopify Admin** — deploy + set App URL; loads App Bridge when opened from admin

Production build (single server serves UI + API):

```bash
npm run build:web
npm run start
# → http://localhost:3001
```

> Standalone: uses `.env` at `http://localhost:5173`. **Embedded in Admin:** deploy (`npm run preview`), set `application_url` in `shopify.app.toml`, add the same URL in Dev Dashboard → app → URLs → App URL. The UI auto-loads App Bridge when opened with `?host=` from Shopify Admin.

## One-time setup

### 1. Create a custom app (Dev Dashboard)

1. Go to [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard).
2. **Apps** → **Create app** → name it (e.g. `Resort Inventory Sort`).
3. **Configure Admin API scopes:**
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `read_orders` (Tier 3 sales-based sort)
4. **Release** the app version, then **Install** it on your store.
5. Open the app → **Settings** → copy **Client ID** and **Client secret**.
6. **Production stores** (like a live `.myshopify.com` shop): run the one-time OAuth install below. Client ID + Secret alone only works for dev stores in your Dev Dashboard org.

### 1b. One-time OAuth install (production stores)

1. Dev Dashboard → your app → **Versions** → **URLs** → add allowed redirect URL:
   ```
   http://localhost:3456/callback
   ```
2. In this project:
   ```bash
   npm run auth:install
   ```
3. Open the printed URL, approve the install. The script saves `SHOPIFY_ACCESS_TOKEN` to `.env`.
4. Add the same token as GitHub secret `SHOPIFY_ACCESS_TOKEN`.

### 2. Push this repo to GitHub

```bash
cd "/Users/kushalyadav/Downloads/Shopify Resort"
git init
git add .
git commit -m "Add inventory-based collection sort"
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### 3. Add GitHub secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example |
|--------|---------|
| `SHOPIFY_STORE` | `your-store.myshopify.com` (no `https://`) |
| `SHOPIFY_CLIENT_ID` | From Dev Dashboard → app → Settings |
| `SHOPIFY_CLIENT_SECRET` | From Dev Dashboard → app → Settings |
| `SHOPIFY_ACCESS_TOKEN` | From `npm run auth:install` (required for production stores) |

### 4. Test with a dry run

**Actions** → **Sort collections by inventory** → **Run workflow** → enable **dry_run** → Run.

Check the job log. If it looks correct, run again with **dry_run** off.

### 5. Local dry run (optional)

```bash
cp .env.example .env
# Edit .env with your store, client ID, and client secret

npm run sort:dry   # preview (loads .env automatically)
npm run sort       # apply
```

## Configuration (`config.json`)

| Field | Description |
|-------|-------------|
| `forceManualSort` | `true` = set collection to Manual sort before reordering (needed for smart collections). |
| `includeHandles` / `includeIds` | If empty, **all** collections are processed. If set, only those are included. |
| `excludeHandles` / `excludeIds` | Skip specific collections (e.g. curated “featured”). |
| `deprioritizeCollectionHandles` | Products in these collections are pushed to the **bottom** when sorting **other** collections (e.g. `["accessories-1"]`). |
| `sortStrategy` | `inventory_full`, `oos_bottom_only`, or `bestselling_then_inventory`. |
| `outOfStockAction` | `push_down` or `hide` (removes OOS from collection). |
| `useOnlineInventory` | `true` = sum variant `sellableOnlineQuantity`. |
| `pinTags` | Product tags that stay pinned at top (default `featured`, `pin-top`). |
| `untrackedPosition` | `"top"` or `"bottom"` for products that don’t track inventory. |
| `sortDirection` | `"desc"` (most stock first) or `"asc"`. |
| `minMovesBeforeReorder` | Skip API reorder if fewer than N products need to move (default `1`). |

Example — sort everything except `sale`, keep accessories at the bottom:

```json
{
  "forceManualSort": true,
  "excludeHandles": ["sale"],
  "deprioritizeCollectionHandles": ["accessories-1"],
  "includeHandles": [],
  "untrackedPosition": "top",
  "sortDirection": "desc"
}
```

Find collection handles in Shopify admin (URL slug) or from a dry-run log, e.g. `ACCESSORIES (accessories-1)`.

## Schedule

Defined in `.github/workflows/sort-by-inventory.yml`:

- **Every hour** (`0 * * * *` UTC)
- **03:00 UTC daily** (extra full pass)

Edit the `cron` lines to change timing.

## Requirements

- Node **20+** (GitHub Actions uses 22)
- Collection product sort must be respected by your theme (most themes use Shopify’s collection order when sort is **Manual**)
- Staff user installing the app must be allowed to reorder products in collections

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Missing required environment variable` | Add `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET` as GitHub secrets. |
| `Client credentials cannot be performed on this shop` | Normal for **production stores**. Run `npm run auth:install`, then use `SHOPIFY_ACCESS_TOKEN` in `.env` / GitHub secrets. |
| `shop_not_permitted` (dev stores) | App and store must be in the **same Dev Dashboard organization**. |
| `invalid_client` | Double-check Client ID and Secret from app **Settings** (not an old API key). |
| `sortOrder is not MANUAL` | Set `forceManualSort: true` in `config.json`. |
| Job timeout on huge catalogs | Increase `timeout-minutes` in the workflow; exclude very large collections temporarily. |
| Order unchanged on storefront | In admin, open the collection → confirm sort is **Manual**; check theme isn’t overriding sort in Liquid. |

## License

Private use for your store.
