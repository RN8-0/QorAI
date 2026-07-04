#!/usr/bin/env bash
# Qor AI — gunduz topup (15:10): amiral gemisi urunlerin fiyatini gunde 2. kez tazele.
# SKIP_FRESH_H=10 -> yalniz 10 saatten eski fiyatlar aga cikar; gerisi keep-alive.
# Gece kosu hala calisiyorsa flock atlar (ayni lock).
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
REPO=/root/qorai-seo
LOG=/root/qorai-price.log
exec 9>/root/qorai-price.lock
flock -n 9 || { echo "$(date -u '+%F %T') gece kosu hala calisiyor — topup atlandi" >> "$LOG"; exit 0; }
exec >>"$LOG" 2>&1
echo "===== $(date -u '+%F %T') UTC — topup basladi ====="
cd "$REPO"
git fetch --quiet origin master && git reset --hard --quiet origin/master
export AMAZON_DIRECT_MARKETS=TR,DE,GB,US
export AMAZON_DIRECT_NO_SESSION=1
export AMAZON_DIRECT_GAP_MS_US=9000
export AMAZON_DIRECT_SKIP_FRESH_H=10
export NO_REINDEX=1
node scripts/sync_offers.js --connector=amazon_direct --all-variants --filter-extra="source='epey.com' && pricedOfferCount>0" --sort=-techScore --limit=800 --concurrency=2 || echo "! topup basarisiz"
unset NO_REINDEX
node scripts/ts_backfill_lowest_price.js --confirm || echo "! ts backfill basarisiz"
echo "===== $(date -u '+%F %T') UTC — topup bitti ====="
