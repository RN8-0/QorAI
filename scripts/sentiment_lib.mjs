// ═══════════════════════════════════════════════════════════════════════════
//  PARAGRAF DUYGUSU — TEK SINIFLANDIRICI
//
//  Bu dosya, bir paragrafin ILK CUMLESININ urun hakkindaki degerlendirmesini
//  positive / negative / neutral olarak etiketler. Etiket METIN URETILIRKEN
//  ya da GERIYE DONUK GOC sirasinda uretilir; ON YUZ ASLA TAHMIN ETMEZ.
//
//  NEDEN KELIME SOZLUGU DEGIL:
//    "smooth" olumsuz bir cumlede gecebilir       -> "impacting the smoothness"
//    "problem" olumsuzluk BILDIRMEYEBILIR         -> "no problems reported"
//    "not bad" olumludur
//    "While efficient, it conflicts with..."      -> olumsuz
//    "Despite the excellent display, it suffers"  -> olumsuz
//  Kok/kelime sayan her yaklasim bu bes kalibin hepsinde yanilir. Olculdu:
//  onceki sozluk tabanli surum gercek cumlelerde 8'de 3 hata veriyordu ve
//  eksiklikleri OVGU gibi yesile boyuyordu.
//
//  ILK CUMLE KURALI: hukum paragrafin GENEL havasina degil, ILK CUMLENIN
//  urun hakkinda soyledigine gore verilir.
//    "Display is excellent. However, 60Hz may disappoint."   -> positive
//    "The 60Hz is a major weakness. However, colors are great." -> negative
// ═══════════════════════════════════════════════════════════════════════════

export const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const GEMINI_URL = `${PB_URL}/api/ai/gemini`;
const GEMINI_MODEL = 'gemini-2.5-flash';

export const DUYGULAR = ['positive', 'negative', 'neutral'];

/* PROMPT ARTIK BURADA DEGIL — TEK KAYNAK admin/js/qor_ai_prompts.js.
   Ayni prompt'u UC taraf kullaniyor: bu goc betigi, admin motoru (yeni
   analizler) ve fixture testi. Ikinci bir kopya kacinilmaz olarak ayrisir;
   bu projede tam olarak o hata bir kez yasandi (goc normalize anahtar
   yaziyordu, AI ham cumle -> yeni analizlerin TEK paragrafi renklenmiyordu). */
await import('../admin/js/qor_ai_prompts.js');
export const SINIFLANDIRICI_SISTEM = globalThis.QorAiPrompts.PARAGRAF_SINIFLANDIRICI;

/** Gemini proxy'sine tek cagri. Anahtar sunucuda; Node'dan da erisilir. */
export async function geminiJson(userText, { maxOutputTokens = 2048, timeoutMs = 90000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: GEMINI_MODEL,
        systemInstruction: { parts: [{ text: SINIFLANDIRICI_SISTEM }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const e = new Error(`AI proxy ${res.status}`);
      e.status = res.status;
      throw e;
    }
    const j = await res.json();
    const metin = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    const m = metin.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } finally { clearTimeout(t); }
}

/**
 * Paragraf listesini etiketler. 25'lik gruplar hâlinde gider: tek cagri
 * cok uzun olursa cikti yarida kesiliyor ve JSON ayristirilamiyor (ayni
 * tuzak rapor uretiminde de yasandi).
 */
export async function etiketle(paragraflar, { grup = 25 } = {}) {
  const hepsi = [];
  for (let i = 0; i < paragraflar.length; i += grup) {
    const dilim = paragraflar.slice(i, i + grup);
    const istek = dilim.map((p, k) => `${k + 1}. ${String(p).replace(/\s+/g, ' ').trim()}`).join('\n\n');
    let etiketler = null;
    for (let deneme = 0; deneme < 5 && !etiketler; deneme += 1) {
      try {
        const j = await geminiJson(istek, { maxOutputTokens: Math.max(512, dilim.length * 24) });
        const l = Array.isArray(j?.labels) ? j.labels : null;
        if (l && l.length === dilim.length) etiketler = l;
      } catch (e) {
        // 429 = KOTA PENCERESI DOLDU, hata degil sinir. Uzun geri cekil;
        // kisa denemeler pencereyi bosaltmadan tekrar vuruyor ve gocun
        // ortasinda calismayi olduruyordu (olculdu: 3. kayitta patladi).
        const bekle = e.status === 429 ? 20000 * (deneme + 1) : 1500 * (deneme + 1);
        if (deneme === 4) throw e;
        await new Promise((r) => setTimeout(r, bekle));
      }
    }
    // GRUPLAR ARASI NEFES. Kota penceresi dakikaliktir; arka arkaya
    // gonderince 3-4 gruptan sonra 429 geliyordu.
    if (i + grup < paragraflar.length) await new Promise((r) => setTimeout(r, 2500));
    // Etiket gelmezse NOTR: uydurma renk vermektense renk vermemek dogru.
    hepsi.push(...(etiketler || dilim.map(() => 'neutral'))
      .map((x) => (DUYGULAR.includes(String(x)) ? String(x) : 'neutral')));
  }
  return hepsi;
}
