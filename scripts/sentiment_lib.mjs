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

export const SINIFLANDIRICI_SISTEM = `You label paragraphs from product analyses.

For each numbered paragraph, judge ONLY ITS FIRST SENTENCE, and only as an
evaluation OF THE PRODUCT:

  positive  the first sentence praises the product or states a strength
  negative  the first sentence criticises the product, names a weakness,
            a limitation, a risk, a mismatch with the buyer's need, or a
            trade-off that costs the buyer something
  neutral   the first sentence states a fact, a spec, context, a date, a
            price observation or a definition without judging the product

HARD RULES — these are where naive labelling fails:

1. JUDGE THE FIRST SENTENCE ONLY. Later sentences may reverse the mood;
   ignore them.
     "The display is excellent. However, the 60Hz may disappoint." -> positive
     "The 60Hz is a real weakness. However, colours are great."    -> negative

2. CONCESSIVE OPENERS FLIP THE WEIGHT. In "although / while / despite /
   even though X, Y", the judgement lives in Y, not X.
     "While the display is bright, its 60Hz feels dated."       -> negative
     "Although expensive, its performance is exceptional."      -> positive

3. NEGATION REVERSES. "not bad", "no problems reported", "doesn't overheat",
   "never stutters" are POSITIVE. "not great", "fails to deliver" are NEGATIVE.

4. A WORD IS NOT A LABEL. "smooth" can sit inside a complaint
   ("impacting the smoothness"); "problem" can sit inside praise
   ("no problems in daily use"). Read the clause, not the vocabulary.

5. MISMATCH IS NEGATIVE. If the first sentence says a trait conflicts with,
   falls short of, or does not meet what the buyer wants, label negative even
   when the trait itself sounds good ("While efficient, it conflicts with the
   user's preference for raw power").

6. FACTS ARE NEUTRAL. Do not force a label. A spec, a release date or a bare
   price figure is neutral even if the product is generally good.

   BUT PRICE AND TIMING ARE JUDGED FROM THE BUYER'S SIDE.
   A price/value/timing sentence is not "about the product", it is about what
   the reader pays and when — and it almost always carries a direction. Judge
   it by whether it is good news or bad news FOR THE BUYER:
     positive  price is falling, a discount or sale window is coming, waiting
               pays off, it is a good time to buy, the price is fair for what
               you get, the value holds up
     negative  price is high or rising, no meaningful drop is expected, you
               will pay a premium, it is poor value, stock is scarce and
               pushes the price up, buying now costs you money you could save
     neutral   ONLY a bare figure or date with no direction at all
               ("Listings sit between 33,249 TL and 39,049 TL.",
                "Apple typically announces the next generation in September.")
   Examples that MUST be labelled, not left neutral:
     "Its price tends to remain stable, with significant drops rare."  -> negative
     "Waiting until Q1 could yield better deals."                      -> positive
     "The biggest drop usually comes when the successor launches."     -> positive
     "Fiyatların yakın zamanda düşmesi beklenmiyor."                   -> negative
     "Yılbaşı kampanyalarında ciddi indirim görülebilir."              -> positive

   BUT A REPORTED FAULT IS NOT A FACT. A sentence that reports a defect, a
   failure, a complaint, a return, or a difficulty owners ran into is
   NEGATIVE even when it is phrased as a flat observation with no judging
   word in it. "Ownership" wording does not make it neutral.
     "Some users received units with dead pixels out of the box."  -> negative
     "Kutudan çıktığı gibi ekran arızası yaşayan kullanıcılar da
      mevcuttur."                                                  -> negative
   Symmetrically, a flatly worded report of something working well is
   POSITIVE ("Owners report the battery lasts a full day").

7. INPUT MAY BE TURKISH. The same six rules apply unchanged. Turkish
   concessive and negation markers to watch:
     ancak / ama / fakat / ne var ki / buna karşın   -> judgement follows
     -e rağmen / -e karşın                            -> judgement follows
     // "-sa da / -se de" EKI EKSIKTI ve olculdu: "…görüşleri genel olarak
     // olumlu OLSA DA, bazı önemli endişeler de dile getirilmektedir."
     // notr etiketlendi, ekranda siyah kaldi. Turkce'de en sik kullanilan
     // odun baglaci bu ve listede yoktu.
     -sa da / -se de (olsa da, etse de, olmakla birlikte)  -> judgement follows
     yine de / bununla birlikte / öte yandan          -> judgement follows
     değil / yok / bulunmuyor / -maz / -mez           -> reverses
     "sorunsuz", "kusursuz", "sınırsız" are POSITIVE even though they
     contain the roots "sorun", "kusur", "sınır".
   Turkish puts the verb last, so the judgement usually sits at the END of
   the first sentence — read it to the end before deciding.
     "512 GB depolama çoğu kullanıcı için fazlasıyla yeterli."  -> positive
     "Uzun yazılım desteği ve dayanıklı yapısı öne çıkıyor."    -> positive
     "60 Hz ekran bu fiyat sınıfı için geride kalıyor."         -> negative
     "Parlak ekrana rağmen 60 Hz tazeleme hızı yetersiz."       -> negative
     "Cihaz 6,3 inç OLED ekrana sahiptir."                      -> neutral

Return ONLY a JSON object: {"labels": ["positive", "neutral", ...]} with
exactly one label per input paragraph, in the same order. No other text.`;

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
