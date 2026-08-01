# Play Store TR Ekran Görüntüleri — Türkçe Metin Spesifikasyonu

## Neden bu dosya var

Play'deki TR listesinde başlık Türkçe ("Qor AI: Telefon Karşılaştır") ama **8 ekran
görüntüsünün hepsi İngilizce**. Dahası, mockup'ın içindeki uygulama arayüzü de
İngilizce ("Tech Score", "Your Match", "Screen Size", "Memory (RAM)").

Türk kullanıcı Play'de Türkçe bir başlık görüp altındaki görsellerde İngilizce
metin görünce uygulamayı "çevrilmemiş / yabancı" sayar ve kurulum yapmadan
çıkar. Ekran görüntüleri, mağaza sayfasında dönüşümü en çok etkileyen tek
unsurdur — açıklama metnini kullanıcıların çoğu hiç açmaz bile.

## Yapılacak iki iş

1. **Uygulama içi görüntüleri Türkçe yeniden çek.** Cihaz dilini Türkçe yap,
   uygulamayı aç, aşağıdaki 8 ekranı yakala. (Kaynak dosyalar:
   `assets/play store/phone/*.png`)
2. **Çerçeve metinlerini Türkçe yaz.** Tasarım aynı kalır: üstte küçük camgöbeği
   büyük harf etiket, altında kalın beyaz başlık, altta telefon mockup'ı.

## Metinler

Başlıkları kısa tuttum — Play, görselleri küçük gösterir; 2 satırı aşan başlık
telefonda okunmaz.

| # | Dosya | Etiket (camgöbeği) | Başlık (beyaz, kalın) |
|---|-------|--------------------|------------------------|
| 1 | `04-analysis` | ANALİZ | Binlerce ürünü saniyeler içinde analiz et. |
| 2 | `04-compare` | KARŞILAŞTIR | 4 ürünü yan yana koy. |
| 3 | `04-tech-score` | TEKNİK PUAN | Tek bakışta hangisi daha iyi. |
| 4 | `04-ai-search` | AKILLI ARAMA | Aradığını tam olarak bul. |
| 5 | `04-paste-a-link` | LİNK YAPIŞTIR | Linki yapıştır, gerisini AI halletsin. |
| 6 | `04-pc-build` | PC TOPLA | Uyumluluk kontrolüyle PC topla. |
| 7 | `04-specs` | ÖZELLİKLER | Bütün özellikler tek ekranda. |
| 8 | `04-subscriptions` | ABONELİKLER | Aboneliklerini de karşılaştır. |

## Sıralama önemli

Play'de kullanıcıların çoğu sadece **ilk 2 görseli** görür; kaydırmaz. Bu yüzden
en güçlü iki özelliği başa al:

1. **LİNK YAPIŞTIR** — rakiplerde olmayan, tek cümlede anlaşılan özellik
2. **KARŞILAŞTIR** — insanların zaten aradığı şey
3. TEKNİK PUAN
4. ANALİZ
5. AKILLI ARAMA
6. ÖZELLİKLER
7. PC TOPLA
8. ABONELİKLER

Mevcut sıralama ANALİZ ile başlıyor; "binlerce ürünü analiz et" soyut bir vaat.
"Linki yapıştır, AI analiz etsin" ise somut ve anında anlaşılıyor.

## Notlar

- Play ekran görüntüsü limiti: en fazla 8 adet, en az 2. Mevcut 1320x2868 boyutu
  uygun.
- Feature graphic (1024x500) da Türkçe olmalı — şu an mağazada görünen tanıtım
  görselini kontrol et.
- Aynı iş `de-DE` için de gerekli; Almanca listede de İngilizce görseller var.
