#!/usr/bin/env bash
# Qor AI — otomatik blog: ~3 GÜNDE BİR yeni satın alma rehberi yayınlar.
#
# E-E-A-T / anti "scaled content abuse" kadansı: her çalışmada EN FAZLA BİR makale
# (gen-articles.mjs --next sıradaki yayınlanmamış niş konuyu üretir; bank bitince
# en eski makaleyi tazeler). Stamp kapısı yayını ~3 güne indirir → ~10 makale/ay,
# Google'ın günlük-hacim ceza bandının çok altında.
#
# Akış: makale PB'ye yazılır → 04:17'deki qorai-seo-refresh.sh onu statik SEO
# shell'ine önizler + website deploy + IndexNow ping'i yapar (aynı gün indekslenir).
# Bu iş İZOLE: bir hata SEO deploy'unu ASLA bozamaz (ayrı script, ayrı lock, ayrı log).
#
# Cron (her gün 03:50 UTC — 04:17 seo-refresh'ten ÖNCE ki aynı gün prerender olsun):
#   50 3 * * * /root/qorai-blog.sh
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
REPO=/root/qorai-seo
LOG=/root/qorai-blog.log
STAMP=/root/qorai-blog.last
MIN_GAP_HOURS=70          # ~3 gün (daily cron + bu kapı = 3 günde bir yayın)

exec 9>/root/qorai-blog.lock
flock -n 9 || { echo "$(date -u '+%F %T') zaten kosuyor — atlandi" >> "$LOG"; exit 0; }

# log 5 MB'i asarsa son 2 MB kalsin
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 5242880 ]; then
  tail -c 2097152 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exec >>"$LOG" 2>&1

# 3-gun kapisi: son basarili yayindan bu yana MIN_GAP_HOURS gecmediyse cik.
if [ -f "$STAMP" ]; then
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$STAMP") ) / 3600 ))
  if [ "$AGE_H" -lt "$MIN_GAP_HOURS" ]; then
    echo "$(date -u '+%F %T') UTC — son yayindan $AGE_H saat gecti (<$MIN_GAP_HOURS) — atlandi"
    exit 0
  fi
fi

echo "===== $(date -u '+%F %T') UTC — blog: yeni makale denemesi ====="
cd "$REPO" || { echo "repo yok: $REPO"; exit 1; }
git fetch --quiet origin master && git reset --hard --quiet origin/master

# PB admin kimligi migration/.env'den okunur (sunucuda mevcut). Tek makale yayinla.
if node web/scripts/gen-articles.mjs --next; then
  touch "$STAMP"
  echo "$(date -u '+%F %T') UTC — yayin OK, stamp guncellendi. 04:17 seo-refresh prerender+deploy+IndexNow yapacak."
else
  echo "$(date -u '+%F %T') UTC — gen-articles basarisiz; stamp DOKUNULMADI (yarin otomatik tekrar)."
fi
echo "===== $(date -u '+%F %T') UTC — blog bitti ====="
