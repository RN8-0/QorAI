# E-posta Doğrulama Mailleri Inbox'a Düşmüyor — Çözüm

## Tanı (28 Nisan 2026)

PocketBase tarafı tamamen sağlıklı:

| Kontrol | Durum |
|---|---|
| `pb.settings.smtp.enabled` | ✅ `true` |
| Host | `smtp.hostinger.com:587` |
| Username | `contact@arain.digital` |
| `pb.settings.testEmail()` sonucu | ✅ `true` (SMTP teslim aldı) |
| Test kullanıcı (`araingamex@gmail.com`) | `verified=false`, `requestVerification` 200 |
| SPF (`arain.digital` TXT) | ✅ `v=spf1 include:_spf.mail.hostinger.com ~all` |
| **DKIM** (`hostingermail._domainkey.arain.digital`) | ❌ **YOK** |
| DMARC | `v=DMARC1; p=none` (lax) |

**Kök neden: Sender domain'in (`arain.digital`) DKIM kaydı yok.** Gmail, DKIM imzası
olmayan üçüncü-parti SMTP'lerden (Hostinger gibi) gelen mailleri agresif olarak
spam'e atıyor veya tamamen düşürüyor (silent drop). Bu nedenle PocketBase 200 dönüyor,
SMTP "delivered" diyor, ama Gmail kullanıcıya hiç göstermiyor.

## Düzeltme adımları (yapılması gereken — tahmini 5 dk + DNS propagation)

### 1) Hostinger panelinden DKIM aç

1. https://hpanel.hostinger.com → **Emails** → **Email Accounts**
2. `contact@arain.digital` satırının yanındaki **Manage** → **DKIM**
3. **Enable DKIM** → kopyala:
   - **Name (Host)**: `hostingermail._domainkey`
   - **Type**: `TXT`
   - **Value**: `v=DKIM1; k=rsa; p=MIIBIjANBg...` (panelden gelen tam string)

### 2) DNS'e ekle

DNS sağlayıcına git (Hostinger nameserver'ları kullanılıyorsa otomatik eklenebilir),
yoksa manuel ekle:

```
Type:  TXT
Name:  hostingermail._domainkey.arain.digital
Value: v=DKIM1; k=rsa; p=MIIBIjAN...
TTL:   3600
```

### 3) Doğrulama

15-30 dakika DNS propagation'ı bekledikten sonra:

```powershell
Resolve-DnsName -Type TXT hostingermail._domainkey.arain.digital
```

Cevap dolu gelmeli. Sonra:

```
node migration\_check_verify.js araingamex@gmail.com
```

Inbox'a düşmesi gerekir.

### 4) (Önerilen) DMARC'ı sıkılaştır

DKIM aktif olunca DMARC'ı `p=none` → `p=quarantine` veya `p=reject` yap:

```
Type:  TXT
Name:  _dmarc.arain.digital
Value: v=DMARC1; p=quarantine; rua=mailto:contact@arain.digital; pct=100; adkim=s; aspf=s
```

## Uygulama tarafında yapılan değişiklikler

- `email_verification_gate.dart`: dialog'a "Spam / Önemsiz klasörünü de kontrol et"
  yardımcı satırı eklendi.
- `ip_location_service.dart`: ipapi.co timeout 5s → 2s, ipwho.is 5s → 3s. İlk açılışta
  IP detection'ın 429 alıp uzun süre bekletmesi engellendi.

## Test scripti

`migration/_check_verify.js` herhangi bir e-posta için kullanıcı kaydını sorgular ve
verification mail'ini tetikler:

```bash
cd migration
node _check_verify.js araingamex@gmail.com
```
