#!/usr/bin/env bash
# Qor AI — Amazon 4-pazar fiyat motoru (Hetzner = tek gercek kaynak).
# PC kapali olsa da fiyatlar guncel kalir. Epey'e GITMEZ (403).
# Pazar gercegi (2026-07-04, bu IP'den olculdu):
#   TR: arama OK  dp OK      -> kesif + tazeleme tam
#   DE: arama OK  dp OK      -> kesif + tazeleme tam
#   GB: arama 202 dp OK      -> TR/DE ASIN koprusuyle fiyatlanir (peer-ASIN)
#   US: arama 503 dp DUVARLI -> keep-alive; PC acikken tazelenir
# Cron: 03:10 (bu script) + 15:10 topup (qorai-price-topup.sh).
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
REPO=/root/qorai-seo
LOG=/root/qorai-price.log
exec 9>/root/qorai-price.lock
flock -n 9 || { echo "$(date -u '+%F %T') zaten kosuyor — atlandi" >> "$LOG"; exit 0; }
# log 5 MB'i asarsa son 2 MB kalsin
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 5242880 ]; then
  tail -c 2097152 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exec >>"$LOG" 2>&1
echo "===== $(date -u '+%F %T') UTC — gece tam kosu basladi ====="
cd "$REPO"
git fetch --quiet origin master && git reset --hard --quiet origin/master
export AMAZON_DIRECT_MARKETS=TR,DE,GB,US
export AMAZON_DIRECT_NO_SESSION=1
export AMAZON_DIRECT_GAP_MS_US=9000
export NO_REINDEX=1
run() { node "$@" || echo "! pass basarisiz (devam): $*"; }
# pass0 — DE besleme: Geizhals kaynakli urunler (amazon.de aramasi bu IP'de calisiyor)
run scripts/sync_offers.js --connector=geizhals_best --filter-extra="source='geizhals.eu'" --limit=500 --concurrency=2
# pass1 — refresh: fiyat gosteren HER urun + varyantlar; en eski kontrol once (dogal rotasyon)
run scripts/sync_offers.js --connector=amazon_direct --all-variants --filter-extra="source='epey.com' && pricedOfferCount>0" --sort=bestOfferCheckedAt --limit=6000 --concurrency=2
# pass2 — kesif A: Epey fiyatli (TR'de satista) hic bakilmamislar; TR/DE aramasi ASIN cozer
run scripts/sync_offers.js --connector=amazon_direct --filter-extra="source='epey.com' && pricedOfferCount<1 && price_raw!='' && bestOfferCheckedAt=''" --sort=-techScore --limit=600 --concurrency=2
# pass2b — kesif A varyantlar (iPhone 1 TB gibi populer varyant sayfalari)
run scripts/sync_offers.js --connector=amazon_direct --all-variants --filter-extra="variantPrimary=false && source='epey.com' && pricedOfferCount<1 && price_raw!='' && bestOfferCheckedAt=''" --sort=-techScore --limit=200 --concurrency=2
# pass3 — kesif B: TR'de satilmayanlar (Pixel/OnePlus sinifi) — DE aramasi cozer.
# --all-variants SART: bu sinifin varyantlari (Pad 4 8/256 gibi) baska hicbir
# pass'e girmiyordu ve sonsuza dek fiyatsiz kaliyordu.
run scripts/sync_offers.js --connector=amazon_direct --all-variants --filter-extra="source='epey.com' && pricedOfferCount<1 && price_raw='' && bestOfferCheckedAt=''" --sort=-techScore --limit=250 --concurrency=2
# pass4 — recheck: bakilmis ama fiyatsiz kalanlar, en eski once
run scripts/sync_offers.js --connector=amazon_direct --filter-extra="source='epey.com' && pricedOfferCount<1 && bestOfferCheckedAt!=''" --sort=bestOfferCheckedAt --limit=250 --concurrency=2
unset NO_REINDEX
node scripts/ts_backfill_lowest_price.js --confirm || echo "! ts backfill basarisiz"
echo "===== $(date -u '+%F %T') UTC — gece kosu bitti ====="
