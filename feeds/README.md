# AWIN / partner product feeds

Drop downloaded merchant product feeds here, then import their prices into the
catalog. Feed files themselves are **git-ignored** (large + affiliate data) —
only this README and `.gitkeep` are committed.

## Why a manual download?

AWIN's advertisers (Coolblue, inateck) moved to the new "Google data feed"
format. Their download URL (`https://ui.awin.com/productdata-darwin-download/...`)
only works inside a logged-in browser session — a plain server-side `fetch`
gets a 404 (bot/route protection). So the feed is downloaded **once via the
browser**, then imported locally. Everything after the download is automatic.

## Steps

1. AWIN → **Toolbox → Create-a-Feed** → pick the joined advertisers
   (Coolblue DE, inateck.de) → columns: `aw_deep_link, product_name, ean,
   brand_name, search_price, currency, merchant_image_url, in_stock,
   merchant_name, delivery_cost` → format **CSV**, delimiter **,**,
   compression **gzip**.
2. Click **Download Datafeed** and save the file here as:
   `feeds/awin-de.csv.gz`
3. Import + match by EAN/GTIN and refresh prices:
   ```
   npm run offers:awin            # real run
   npm run offers:awin -- --dry-run   # preview, writes nothing
   ```

## What the import does

- Matches each feed row to a catalog product **only by EAN/GTIN** (no fuzzy
  title match → no wrong-variant / accessory pollution).
- Writes one `offers` row per product+store, tagged `country=DE`,
  `currency=EUR`, with the ready `aw_deep_link` affiliate URL.
- Refreshes the product price rollup and reindexes Typesense.
- The website shows these offers **only to visitors detected in DE** (Coolblue
  / inateck don't ship to TR), so a Turkish visitor never sees a price they
  can't order.

Re-run whenever you want fresh prices (feeds update daily). Products without a
matching EAN in the catalog are skipped — that's expected.
