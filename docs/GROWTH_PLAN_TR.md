# Qor AI — Sıfır Bütçe Büyüme Planı

Durum tespiti (2026-08-01, ölçülmüş):

- Play: 50+ indirme, **0 yorum / 0 puan**
- Site: teknik olarak indeksleniyor (ürün sayfaları gerçek aramada çıkıyor),
  ama trafik yok
- Uygulama: **analytics tamamen kapalıydı** — kullanıcı davranışına dair
  hiçbir veri toplanmamış (bu commit'te açıldı)

## Neden aylardır dönmüyor

SEO ve ASO'nun ikisi de **zaten var olan otoriteyi ödüllendiren** kanallar.
Google yeni domaine sıralama vermez, Play puansız uygulamayı öne çıkarmaz.
İkisi de "önce başka yerden kullanıcı getir, sonra biz seni büyütürüz" der.

Sen bu iki kanala aylarını verdin ama ikisinin de ön koşulunu (dış kaynaklı ilk
kullanıcı kütlesi + sosyal kanıt) hiç sağlamadın. Eksik olan çalışma değil,
sıralama.

---

## 1. Hafta: Ölçüm + sosyal kanıt

### ✅ Analytics açıldı (kodda, bu commit)
Sürüm yayınlandıktan ~24 saat sonra Firebase Console → Analytics'te şunlara bak:

| Soru | Bakılacak yer |
|------|---------------|
| İndirenler uygulamayı açıyor mu? | `first_open` vs `screen_view` |
| Nerede bırakıyorlar? | `screen_view` ekran sıralaması |
| Çekirdek özellik kullanılıyor mu? | `comparison_start` → `comparison_complete` |
| Link analizi kırılıyor mu? | `link_analysis` vs `link_analysis_failed` |
| Paywall nereden açılıyor? | `paywall_view` (source parametresi) |

**Kritik olan `comparison_start` → `comparison_complete` oranı.** Düşükse
uygulamada gerçek bir sorun var demektir. Yüksekse sorun uygulamada değil,
kimsenin uygulamadan haberi olmamasında — ki tahminim bu.

### ✅ Puanlama istemi eklendi (kodda, bu commit)
Kullanıcı 3. değerli eylemini tamamladığında (karşılaştırma/analiz bitti),
kurulumdan en az 2 gün sonra, sürüm başına bir kez Play puanlama sayfası açılır.

### ⬜ İlk 20 puanı elle topla
Bu utanılacak bir şey değil, her uygulama böyle başlar. Play'in algoritması
5 puandan sonra yıldız göstermeye başlar, ~20 puandan sonra organik aramada
görünmeye başlar.

Tanıdıklarına gönderilecek mesaj:

> Selam, aylardır üzerinde çalıştığım uygulamayı Play'e koydum: telefon,
> laptop, ekran kartı karşılaştırıyor, ürün linkini yapıştırınca yapay zeka
> "al mı, alma mı" diyor. Kurup 2 dakika denesen ve dürüst bir puan bıraksan
> çok işime yarar — puanı olmayan uygulama Play'de hiç görünmüyor.
> https://play.google.com/store/apps/details?id=com.compair.app

**Kimseye "5 yıldız ver" deme.** Play sahte puanı tespit eder ve uygulamayı
listeden düşürür. Dürüst puan iste; 4 ortalama, 5'ten daha güvenilir görünür.

### ⬜ Ekran görüntülerini Türkçeleştir
Bkz. `docs/ASO_SCREENSHOTS_TR.md`. Mağaza sayfasında dönüşümü en çok etkileyen
tek unsur bu.

### ⬜ Mağaza metinlerini güncelle
Hazır: `android/fastlane/metadata/android/{tr-TR,en-US}/`. Play Console →
Ana mağaza girişi'ne kopyala.

---

## 2. Hafta: İlk gerçek kullanıcılar

Burası işin özü. **Türkiye'de her gün yüzlerce insan "hangisini almalıyım?"
diye soruyor.** Uygulaman tam olarak bu sorunun cevabı. Onları bulman yeterli.

### Nerede soruyorlar

| Yer | Ne var |
|-----|--------|
| **Technopat Sosyal** | Günlük onlarca "hangi telefon/laptop/ekran kartı" başlığı |
| **DonanımHaber Forum** | Aynısı, daha büyük ve daha eski kitle |
| **r/Turkey, r/pcmasterrace** | Toplama PC ve telefon soruları |
| **Facebook: "Bilgisayar Toplama" grupları** | Çok aktif, çok soru |
| **Ekşi Sözlük** | İlgili başlıklar — ama reklam kokan giriş silinir |

### Nasıl yaklaşmalı

**Link atıp kaçma. Anında banlanırsın ve marka yanar.**

Doğru yöntem: soruyu gerçekten cevapla. İki ürünü kıyasla, neden birini
önerdiğini yaz, sonra en sonda "bu karşılaştırmayı şuradan da görebilirsin"
diye ürün sayfası linkini bırak. Cevabın kendisi linksiz de değerli olmalı.

Günde 3-5 soru cevapla. Haftada ~25 nitelikli cevap. Bu, ilk 100 kullanıcıyı
getirecek tek gerçekçi kanal — ve bu insanlar tam hedef kitlen.

### Yan fayda
Forum cevaplarındaki linkler Google için de sinyal. SEO'nun tıkandığı yer
zaten backlink yokluğuydu.

---

## 3-4. Hafta: Tekrarlanabilir içerik

### Video (en yüksek getirili)
Uygulamanın **gösterilebilir** bir kancası var: link yapıştır → analiz çıksın.
15-30 saniyelik ekran kaydı, TikTok/Instagram Reels/YouTube Shorts.

Format: "Trendyol'dan telefon alacaktım, önce şunu yaptım" → linki yapıştır →
sonuç ekranı → "pahalıymış, almadım". Anlatım gerekmez, ekran kaydı yeter.

Bunlar tutmazsa bir şey kaybetmezsin; tutarsa tek video 10 bin kurulum getirir.

### Blog: baş kelimeleri bırak, uzun kuyruğa gir
"telefon karşılaştırma" kelimesinde Hepsiburada/ShiftDelete/Epey ile
yarışamazsın — 15 yıllık domainler. Ama şunlarda yarışabilirsin:

- "Redmi Note 14 Pro mu Galaxy A56 mı" (spesifik model karşılaştırmaları)
- "15000 TL altı en iyi telefon 2026"
- "RTX 5060 hangi işlemciyle darboğaz yapmaz"

Bunlar düşük hacimli ama **satın alma niyeti çok yüksek** ve rekabeti düşük.
Katalogda 106 bin ürün var; bu içeriği üretecek veri zaten sende.

---

## Ne YAPMAMALI

- **Reklam verme.** Ölçüm daha yeni açıldı. Funnel'ın nerede kırıldığını
  bilmeden reklam vermek parayı ısıtmaktır. En az 2 hafta veri topla.
- **SEO'ya daha fazla teknik iş yapma.** Site teknik olarak sağlıklı; sorun
  otorite eksikliği ve bu koda dokunarak çözülmez.
- **Sahte yorum satın alma.** Play tespit eder, uygulama listeden düşer.
- **Yeni özellik ekleme.** Uygulamada özellik eksiği yok — kullanıcı eksiği var.
  Yeni özellik yazmak, pazarlama yapmaktan kaçmanın en konforlu yolu.

---

## Gerçekçi beklenti

Bu plan 3 ayda **birkaç bin kurulum** getirir, yüz bin değil. Sıfır bütçeyle
organik büyümenin hızı budur. Ama önemli olan şu: ilk 500 gerçek kullanıcı ve
20 yorum geldikten sonra Play'in organik dağıtımı devreye girer ve eğri
kendiliğinden dikleşir. Şu anda o eşiğin çok altındasın — teknik bir arıza
yüzünden değil, kimse duymadığı için.
