// Geçmiş kaydından YAPISAL raporu çıkarır.
//
// Kullanıcı: "geçmiş işlemlerde yapılan analiz ve UI nasılsa birebir aynı
// olacak; geçmişte sadece özet tutuluyor bu çok saçma."
//
// ÖLÇÜM (2026-08-08, canlı kayıtlar): veri aslında KAYIPTA DEĞİLDİ.
//   comparison_history → analysisData.analysis = 33.052 karakter,
//                        JSON, type=compare_full_report
//   product_history    → 21.512 karakter, type=product_full_report
// Yani tam rapor diskte duruyordu; ekran onu DÜZ METİN sanıp `AiText` ile
// paragraf olarak basıyordu. Kayıp gösterimdeydi, kayıtta değil.
//
// Ayrıca `aiSummary` alanı 5000 karakterde KESİLİR — okuyucu ona düşerse
// gerçekten özet gösterir. Bu yüzden önce `analysisData.analysis` denenir.

const KNOWN_TYPES = new Set([
  'compare_full_report',
  'product_full_report',
  'compare_structured',
  'subscription_full_report',
]);

/**
 * @returns {{ kind:'structured', data:object } | { kind:'text', text:string } | null}
 */
export function historyPayload(item) {
  if (!item) return null;

  // 1) Kaydedilmiş yapısal sonuç (yeni kayıtlar bunu taşır).
  const r = item.result;
  if (r && typeof r === 'object' && Object.keys(r).length) {
    return { kind: 'structured', data: r };
  }

  // 2) `analysis` bir JSON METNİ olabilir — karşılaştırma ve ürün analizleri
  //    tam raporu buraya yazıyor. Düz metin sanılıp paragraf olarak basılıyordu.
  const raw = String(item.analysis || '').trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const t = String(parsed.type || '');
        // Tip bilinmese bile yapısal alanları varsa yapısal say.
        if (KNOWN_TYPES.has(t) || Array.isArray(parsed.products)
            || Array.isArray(parsed.services) || parsed.comparison || parsed.base) {
          return { kind: 'structured', data: parsed };
        }
      }
    } catch { /* JSON değilmiş: düz metne düş */ }
  }

  if (raw) return { kind: 'text', text: raw };
  return null;
}

/** Kayıt tam raporu taşıyor mu? Liste ekranında rozet göstermek için. */
export function historyHasFullReport(item) {
  const p = historyPayload(item);
  return Boolean(p && p.kind === 'structured');
}
