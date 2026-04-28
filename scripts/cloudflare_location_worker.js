/**
 * Cloudflare Worker — Qor AI Location Detection
 *
 * DEPLOY ADIMLARI:
 * 1. https://workers.cloudflare.com adresine git
 * 2. "Create a Service" → isim ver (örn: qorai-location)
 * 3. Bu dosyanın içeriğini Worker editörüne yapıştır
 * 4. "Save and Deploy" butonuna tıkla
 * 5. Worker URL'ini kopyala (örn: https://qorai-location.your-username.workers.dev)
 * 6. lib/services/ip_location_service.dart içindeki _cloudflareWorkerUrl sabitine yaz
 *
 * ÜCRETSİZ LİMİT: Günde 100.000 istek (Cloudflare Free Tier)
 */

export default {
  async fetch(request) {
    const cf = request.cf;

    // Cloudflare otomatik olarak istek yapan cihazın ülkesini tespit eder.
    // Bu bilgi için dışarıya hiçbir istek atılmaz — sıfır gecikme.
    const countryCode = cf?.country ?? 'US';
    const timezone    = cf?.timezone ?? 'UTC';
    const continent   = cf?.continent ?? 'NA';

    // CORS — Flutter mobil uygulaması için gerekli
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    };

    return new Response(
      JSON.stringify({
        country_code: countryCode,
        timezone:     timezone,
        continent:    continent,
        success:      true,
      }),
      { status: 200, headers },
    );
  },
};
