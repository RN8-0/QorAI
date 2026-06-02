# Qor AI — Web Sitesi UI Denetim Raporu

_Tarih: 2026-06-02 · Kapsam: `web/src` (canlı: qorai.net) vs. Flutter uygulaması_
_Kanıt: canlı siteden alınan ekran görüntüleri → `temp_screenshots/ui_audit/`_

---

## 0. TL;DR — En kritik 5 bulgu

1. **🔴 Ürün görselleri Chrome/Edge'de hiç görünmüyor (production hatası).** `resim.epey.com`
   görselleri `Cross-Origin-Resource-Policy` (CORP) ile korunuyor → Chromium tarayıcılar
   `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` ile bloklar. 117 görsel isteğinin **hepsi** başarısız,
   tüm kartlar gri placeholder gösteriyor. Uygulama proxy kullandığı için etkilenmiyor.
2. **🔴 Ana sayfada "Kategoriler" bölümü yok.** Kod kategorileri hesaplıyor ama hiç render etmiyor.
   `/category` sayfası ise "Ana sayfadan bir kategori seç" diyor → **çıkışsız döngü (dead-end)**.
3. **🟠 Karşılaştırma ekranı uygulamayla aynı değil.** Web düz bir HTML tablosu; uygulamada
   çift halka (Eşleşme + Tech skoru) kartları ve **Fiyatlar / Özellikler / AI Analizleri** sekmeleri var.
   Web'de Fiyatlar ve AI Analizi sekmeleri tamamen eksik.
4. **🟠 Birçok sayfa "boş kabuk".** AI Sohbet ve Abonelikler sayfaları ekranın ortasında küçük bir
   kutu + altta kocaman siyah boşluk. Footer yukarı çıkıyor, sayfa viewport'u doldurmuyor.
5. **🟡 Yarım kalmış tasarım göçü.** `Home.css`'in ~%80'i ölü kod (`.h-catgrid`, `.h-searchbar`,
   `.h-cat`, `.h-tools`…). JSX artık `global.css` sınıflarını kullanıyor, eski CSS atılmamış.

---

## 1. Doğru haber: Renk paleti ve tasarım sistemi zaten uyumlu

Önce iyi haber — **renk paleti ve tasarım token'ları sorun değil.** `web/src/styles/global.css`,
uygulamanın `lib/core/theme.dart` dosyasının düzgün bir portu. Marka renkleri, yüzeyler, radius'lar,
tipografi birebir eşleşiyor:

| Token | Uygulama (`theme.dart`) | Web (`global.css`) | Durum |
|---|---|---|---|
| Marka Cyan | `#00E5FF` | `--brand-cyan #00E5FF` | ✅ |
| Marka Blue | `#2196F3` | `--brand-blue #2196F3` | ✅ |
| Marka Deep | `#1565C0` | `--brand-deep #1565C0` | ✅ |
| Premium Violet | `#7C3AED` | `--violet #7C3AED` | ✅ |
| OLED arka plan | `#000000` | `--bg #000000` | ✅ |
| Yüzeyler | `#0A0A0A / #121212 / #1A1A1A` | `--surface / -2 / elevated` | ✅ |
| Metin | `#F1F5F9 / #94A3B8 / #64748B` | `--text / -2 / -3` | ✅ |
| Skor renkleri | Emerald/Amber/Rose | aynı | ✅ |
| Font | Plus Jakarta Sans | Plus Jakarta Sans | ✅ |

**Sonuç:** "renkler/tema yanlış" değil. Sorun **layout, bileşen paritesi ve özellik eksiklikleri** —
yani doğru boyaları doğru duvarlara sürmemişiz.

---

## 2. Kök sorun: "Bire bir aynı" beklentisi neden tutmuyor

Uygulama bir **telefon uygulaması** (alt yüzen nav bar, tek kolon, dikey akış).
Web bir **masaüstü site** (üstte sticky header + mega-menü, çok kolonlu grid, dev pazarlama hero'su).

Bu ikisi **piksel piksel aynı olamaz ve olmamalı** — farklı cihaz, farklı etkileşim. Doğru hedef:
**aynı tasarım dili** (renk + tipografi + skor halkaları + kart stili + boşluk ritmi), farklı yerleşim.
Token'lar zaten ortak; asıl açık **bileşen ve sayfa düzeyinde**. Aşağıdaki bölümler bunu kapatıyor.

### Navigasyon farkı
| | Uygulama | Web |
|---|---|---|
| Birincil nav | Alt yüzen pill (Ana Sayfa · Karşılaştır · Link Analizi · Abonelik) | Üst header + Kategoriler mega-menü |
| Mobilde | Alt nav bar | Hamburger drawer |
| Karşılama | "Good Evening, Aaron" + Premium chip + Q-coin | Yok (sadece avatar) |

> Öneri: Web'de **mobilde** uygulamadaki gibi bir **alt sticky tab-bar** (Ana Sayfa/Karşılaştır/Link/Abonelik)
> ekleyince mobil web aniden uygulamaya çok benziyor. Masaüstünde üst header kalsın.

---

## 3. Sayfa sayfa UI hataları ve eksikler

### 3.1 Ana Sayfa — `web/src/pages/Home.jsx`
- 🔴 **Kategoriler grid'i render edilmiyor.** `categories` useMemo'da hesaplanıyor (181–191. satır)
  ama JSX'te hiç kullanılmıyor. Uygulamanın ana sayfasında Kategoriler **en üstte ve en belirgin**
  bölüm; web'de hiç yok. → `/category`'nin "ana sayfadan kategori seç" mesajı bu yüzden tuzak.
- 🟠 **Bölüm paritesi eksik.** Uygulama: Arama → **Kategoriler** → Senin İçin → Trend → Quiz hatırlatıcı
  → Kategoride Zirve → Son Görüntülenen → Son Analiz. Web: dev Hero → Senin İçin → Trend → Reklam →
  Son Görüntülenen → Yeni Eklenenler. (Kategoriler, Quiz, Kategoride Zirve, Son Analiz **yok**.)
- 🟡 **Ölü CSS.** `Home.css` içindeki `.h-searchbar / .h-search / .h-suggest / .h-catgrid / .h-cat /
  .h-sec / .h-tools` sınıfları artık JSX'te kullanılmıyor (global.css'e geçilmiş). Animasyon kuralları
  da olmayan sınıflara bağlı → sil/temizle.
- 🟡 **Hero çok "pazarlama sitesi" havasında.** Uygulamada böyle bir landing hero yok; bu kötü değil
  ama uygulama hissini bozuyor. Hero'yu küçültüp altına Kategoriler grid'ini koymak iki dünyayı birleştirir.

### 3.2 Kategoriler — `web/src/pages/Category.jsx`
- 🔴 **Çıkışsız boş durum.** `?cat=` yokken "Ana sayfadan bir kategori seç" yazıyor; ama ana sayfada
  seçilecek grid yok. Kullanıcı sadece header mega-menüsünden girebiliyor (keşfedilmesi zor).
  → Bu sayfanın kendi içinde **tüm kategorilerin grid'i** olmalı (uygulamadaki kategori ekranı gibi).

### 3.3 Karşılaştır — `web/src/pages/Compare.jsx`
- 🟠 **Yapı uygulamadan kopuk.** Uygulama: üstte iki ürün, her birinde **çift halka** (Eşleşme %72 + Tech 100),
  altında **Fiyatlar / Özellikler / AI Analizleri** sekmeleri. Web: sadece düz spec **tablosu** + skor satırı.
- 🟠 **Fiyatlar sekmesi yok, AI Analizi sekmesi yok.** Uygulamanın çekirdek değeri (mağaza/fiyat + AI yorumu)
  web karşılaştırmasında tamamen eksik.
- 🟡 Mobilde tablo yerine kartlar gerekiyor; geniş tablo dar ekranda kötü. (Boş durumdaki popüler ürün
  kartları mobilde devasa ve görseller kırık olduğu için bomboş — bkz. `compare-mobile-dark.png`.)

### 3.4 AI Sohbet — `web/src/pages/AiChat.jsx`
- 🟠 Tam sayfa sohbet UI'ı yok; sadece "sağ alttaki balonu aç" diyen küçük bir kutu + dev boşluk.
  Uygulamada AI sohbet tam ekran bir deneyim. Web'de en azından sayfa viewport'u doldurmalı.

### 3.5 Abonelikler — `web/src/pages/Subscriptions.jsx`
- 🟡 Chip'ler + "Ekle" inputu var ama altı bomboş; footer yukarı fırlıyor. İçerik viewport'u doldurmuyor.

### 3.6 Link Analizi — `web/src/pages/LinkAnalysis.jsx`
- ✅ Görece en temiz sayfa (form + "Analiz Et"). Yine de sonuç boşken alt boşluk fazla.

### 3.7 Genel / tüm sayfalar
- 🔴 **Görseller (CORP).** Bkz. Bölüm 4 — tek başına en yıkıcı sorun, her sayfayı etkiliyor.
- 🟡 **Boş-durum dikey boşluğu.** İçi az olan sayfalarda `min-height` yok; footer ortaya geliyor,
  altta büyük siyah void kalıyor. `#root > main { min-height: calc(100vh - header - footer) }` benzeri.
- 🟡 Yüzen AI balonu mobilde alt-sağda dil seçici / footer ile çakışabiliyor.

---

## 4. 🔴 1 Numaralı Sorun: Ürün görselleri (CORP) — detay + çözüm

**Belirti:** Tüm ürün kartları gri "dağ" placeholder'ı gösteriyor (dark+light, masaüstü+mobil hepsinde).

**Kanıtlanmış kök sebep:** `web/src/components/ProductImg.jsx` görselleri **doğrudan**
`https://resim.epey.com/...` adresinden `<img src>` ile yüklüyor. epey görselleri
`Cross-Origin-Resource-Policy` header'ı ile koruyor → Chromium tarayıcılar başka origin'e (qorai.net)
gömülmesini bloklar:

```
net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin   (117/117 epey isteği başarısız)
```

Veri tarafı **sağlam** — Typesense'te `imageUrl` dolu (ör. `resim.epey.com/79676/m_...png`).
Sorun tamamen yüklemede. Uygulama bu yüzden `scraper-proxy` üzerinden çekip etkilenmiyor.

**Çözüm seçenekleri (önerilen → sırayla):**
1. **Kendi domaininden görsel proxy'si.** `https://qorai.net/img?u=<epey-url>` gibi bir uç nokta
   (Coolify/PB hook ya da küçük bir worker) görseli sunucu tarafında çekip **CORP olmadan** yeniden yayınlasın.
   `imageCandidates()` çıktısını bu proxy'den geçir. (App'in yaptığının web sürümü.)
2. **Görselleri kendi CDN/Storage'ına kopyala** (PB files / object storage) ve `imageUrl`'i kendi
   domainine yaz. En sağlamı, ama migration işi.
3. Kısa vadeli yama: proxy hazır olana kadar placeholder yerine **kategori ikonlu** güzel fallback göster
   (uygulamadaki gibi) — şu an native kırık-resim estetiği veriyor.

---

## 5. Renk paleti & tasarım — referans (doğru hedef)

Token'lar zaten doğru; aşağıdaki tek referans olarak kalsın. **Hiçbir bileşen ham hex kullanmasın,
hep değişken.**

```
Marka:    cyan #00E5FF · blue #2196F3 · deep #1565C0 · sky #4FC3F7
Premium:  violet #7C3AED → indigo #4F46E5 (gradient)
Skor:     ≥80 #10B981 · 60–79 #34D399 · 40–59 #F59E0B · <40 #EF4444
Dark:     bg #000 · surface #0A0A0A/#121212/#1A1A1A · text #F1F5F9/#94A3B8/#64748B
Light:    bg #F8FAFC · surface #FFF/#F1F5F9 · text #0F172A/#475569/#94A3B8
Font:     Plus Jakarta Sans (400–800), letter-spacing -0.01em ~ -0.04em (başlıklar)
Radius:   sm 10 · md 14 · lg 18 · xl 24 · 2xl 30 · pill 999
Gradient: brand 135° deep→blue→cyan · ai 90° cyan→blue
```

**Bileşen prensipleri (uygulama dilini web'e taşımak için):**
- **Kart:** `surface` + 1px `border` + `--card-glow`, radius `xl`. Hover'da 2–3px yukarı + border parlaması. ✅ (zaten var)
- **Skor halkası (Gauge):** her ürün kartında, üst-sağ rozet. ✅ ama görseller gelince daha anlamlı olacak.
- **Eşleşme rozeti (match-pill):** cyan→blue gradient pill. Karşılaştırmada öne çıkar.
- **Butonlar:** birincil = gradient (`btn-grad`), ikincil = `btn-ghost`, satın al = yeşil. ✅
- **Bölüm başlığı:** soldaki dikey gradient bar + kalın başlık + "Tümünü gör →". ✅

---

## 6. Önceliklendirilmiş yapılacaklar

**P0 — hemen (görsel + ölü bağlar)**
- [ ] Görsel proxy'si kur, `ProductImg` candidate'larını proxy'den geçir (Bölüm 4).
- [ ] Ana sayfaya **Kategoriler grid'i** ekle (kod zaten kategori hesaplıyor; sadece render et).
- [ ] `/category` boş durumunu **tüm kategoriler grid'i** ile değiştir (dead-end'i kaldır).

**P1 — parite (uygulama hissi)**
- [ ] Karşılaştırmaya **Fiyatlar** ve **AI Analizleri** sekmelerini + çift-halka ürün başlıklarını ekle.
- [ ] Mobilde **alt sticky tab-bar** (Ana Sayfa/Karşılaştır/Link/Abonelik).
- [ ] Boş sayfalara `min-height` ver, footer'ın yukarı fırlamasını engelle.
- [ ] Mobil karşılaştırmayı tablo→kart düzenine çevir.

**P2 — temizlik & cila**
- [ ] `Home.css` ölü kodunu temizle (`.h-*` sınıfları + bağlı animasyonlar).
- [ ] AI Sohbet sayfasına tam-ekran sohbet ya da en azından dolu bir layout.
- [ ] Yüzen AI balonu z-index/konum çakışmalarını düzelt.
- [ ] Karşılama satırı (selam + Q-coin + Premium chip) — uygulama paritesi.

---

_Ekran görüntüleri: `temp_screenshots/ui_audit/*.png` · Yeniden üretmek için: `node scripts/_ui_audit_shots.mjs`_
