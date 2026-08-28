// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANMIS ANALIZLERDE EKSIK KRONIK SORUN LISTESINI ONARIR
//
//  NEDEN VAR — olculdu 2026-08-25, canli `analyses` koleksiyonu:
//
//    kategori         urun                        TR  EN
//    laptops          MacBook Neo                  0   2
//    graphics_cards   RTX 5090 TUF                 0   3
//    smartphones      Redmi K100 Pro               0   3
//    smartphones      iPhone 17                    4   1
//
//  Kok neden: TR ve EN raporlari IKI AYRI grounded arastirma kosuyordu ve
//  arastirma prompt'una `languageGate` uygulandigi icin model Turkce cevap
//  verecegi zaman Turkce kaynak ariyordu. Telefonda Turkce sahiplik
//  tartismasi bol; laptop/ekran karti/TV/kulaklikta yok denecek kadar az.
//  Sonuc: "Kronik sorunlar" bolumu pratikte YALNIZ telefonlarda ciciyordu.
//
//  Prompt tarafi duzeltildi (admin/js/qor_ai_prompts.js -> researchSourceGate,
//  chronicResearchGate) ama o yalnizca BUNDAN SONRAKI analizleri etkiler.
//  Bu betik zaten yayinda olan kayitlari onarir.
//
//  OLCEK: `analyses` elle yayinlanan bir koleksiyon (bugun 14 kayit) ve
//  buyumesi urun sayisiyla DEGIL editoryal hizla olculuyor. Betik kayit
//  basina 1 grounded arastirma + eksik dil basina 1 cikarim cagrisi yapar;
//  dosya URETMEZ, kaydi yerinde gunceller.
//
//  KULLANIM
//    node web/scripts/fix-chronic-issues.mjs            # ne yapacagini yazar
//    node web/scripts/fix-chronic-issues.mjs --apply    # PB'ye yazar
//    node web/scripts/fix-chronic-issues.mjs --apply --slug=apple-macbook-neo-mhfe4tu-a
// ═══════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prompt metni BURADA YENIDEN YAZILMAZ. Tek kaynak admin/js/qor_ai_prompts.js;
// ikinci bir kopya kacinilmaz olarak ayrisir (bkz. spec_i18n dersi).
import '../../admin/js/qor_ai_prompts.js';

const P = globalThis.QorAiPrompts;
if (!P) throw new Error('[fix-chronic] admin/js/qor_ai_prompts.js yuklenemedi');

const here = dirname(fileURLToPath(import.meta.url));
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

const APPLY = process.argv.includes('--apply');
// Virgullu liste kabul eder: --slug=a,b,c
const ONLY_SLUG = (process.argv.find((a) => a.startsWith('--slug=')) || '').slice(7)
  .split(',').map((s) => s.trim()).filter(Boolean);
const DEBUG = process.argv.includes('--debug');
// Dolu listeyi de YENIDEN uretir. Kanit kapisi eklenmeden once yazilmis
// kayitlarda kategori genellemesi ("laptoplarda pil sisebilir") bulgu diye
// duruyor; onlari duzeltmenin yolu bu.
const FORCE = process.argv.includes('--force');

function pbCreds() {
  const e = { ...process.env };
  if (!e.POCKETBASE_ADMIN_EMAIL || !e.POCKETBASE_ADMIN_PASSWORD) {
    const f = join(here, '..', '..', 'migration', '.env');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i < 0 || line.startsWith('#')) continue;
        const k = line.slice(0, i).trim();
        if (!e[k]) e[k] = line.slice(i + 1).trim();
      }
    }
  }
  return {
    url: (e.POCKETBASE_URL || PB_URL).replace(/\/$/, ''),
    email: e.POCKETBASE_ADMIN_EMAIL,
    pass: e.POCKETBASE_ADMIN_PASSWORD,
  };
}

let token = '';
async function pbAuth() {
  const { url, email, pass } = pbCreds();
  if (!email || !pass) throw new Error('POCKETBASE_ADMIN_EMAIL/PASSWORD yok (migration/.env)');
  const r = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  if (!r.ok) throw new Error(`PB auth ${r.status}`);
  token = (await r.json()).token;
}
async function pb(method, path, body) {
  const { url } = pbCreds();
  const r = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Gemini (PB proxy) ─────────────────────────────────────────────────────
// `tools` alani proxy'den GECIYOR (pb_hooks/gemini.pb.js), yani grounded
// arama buradan da kosuyor. Kimlikli istekte limit 60 cagri / 5 dk.
async function gemini({ system, user, tools = null, json = false, maxOutputTokens = 4096, temperature = 0.2 }) {
  const { url } = pbCreds();
  const body = {
    model: 'gemini-2.5-flash',
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    // `thinkingBudget: 0` — admin/js/qor_ai_run.js -> geminiOnce ile AYNI.
    // Onsuz gemini-2.5-flash dusunme adimini cikti tavanindan yiyor ve yanit
    // BOS donuyor ("gemini empty"); bu tuzak projede bir kez odendi.
    generationConfig: { maxOutputTokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
  };
  // JSON kipi ile arac kullanimi AYNI ANDA olmaz: grounded cagri duz metin
  // doner, cikarim cagrisi JSON. Ikisini karistirmak "no content" veriyor.
  if (json) body.generationConfig.responseMimeType = 'application/json';
  if (tools) body.tools = tools;
  const r = await fetch(`${url}/api/ai/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gemini ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!txt) throw new Error('gemini empty');
  return txt;
}

// ── Kayittan urun baglamini cikar ─────────────────────────────────────────
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/** `report_<lang>` icindeki her urun govdesi: [{yol, gorunenAd, community}] */
function bodies(rapor) {
  const r = obj(rapor);
  if (!r) return [];
  if (obj(r.community)) {
    return [{ yol: 'community', ad: r.product?.name || '', community: r.community }];
  }
  if (Array.isArray(r.products)) {
    return r.products
      .map((p, i) => (obj(p?.community) ? { yol: `products.${i}.community`, ad: p.name || '', community: p.community } : null))
      .filter(Boolean);
  }
  if (Array.isArray(r.services)) {
    return r.services
      .map((s, i) => (obj(s) ? { yol: `services.${i}`, ad: s.name || '', community: s } : null))
      .filter(Boolean);
  }
  return [];
}

function setPath(root, yol, deger) {
  const parcalar = yol.split('.');
  let cur = root;
  for (let i = 0; i < parcalar.length - 1; i += 1) cur = cur[parcalar[i]];
  cur[parcalar[parcalar.length - 1]] = deger;
}

const LANGS = ['tr', 'en'];

/**
 * `parca`daki kelimelerin ne kadari `metin` icinde geciyor (0-1).
 *
 * Duz `includes()` YETMEZ: model dayanak cumlesini birebir kopyalamiyor,
 * kirpiyor ve noktalama degistiriyor. Kelime kumesi orani bunu yakalar.
 * Diakritik katlanir — ayni olgu bir yerde "sarj", baska yerde "şarj".
 */
function koku(metin) {
  return new Set(
    String(metin || '')
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((k) => k.length >= 5)
      .map((k) => k.slice(0, 6)),
  );
}
function ortakOran(parca, metin) {
  const a = koku(parca);
  if (a.size < 3) return 0;
  const b = koku(metin);
  let ortak = 0;
  for (const t of a) if (b.has(t)) ortak += 1;
  return ortak / a.size;
}

// ── Arastirma + cikarim ───────────────────────────────────────────────────
// Grounded cagri gecici olarak BOS donebiliyor (arac kullanimi + ucretsiz
// anahtar). Uretimdeki askGrounded() de 3 deneme yapiyor — burasi ayni.
async function tekrarli(fn, n = 3) {
  let son;
  for (let i = 0; i < n; i += 1) {
    try { return await fn(); } catch (e) { son = e; await sleep(900 + i * 800); }
  }
  throw son;
}

async function kronikArastir(ad, kategori) {
  return tekrarli(() => gemini({
    system: P.groundedResearchSystemPrompt('en'),
    user: `Research the ownership failure record of "${ad}"${kategori ? ` (category: ${kategori})` : ''}.\n\n`
      + `${P.researchSourceGate('en')}\n\n${P.chronicResearchGate(kategori)}\n\n`
      + 'Reply with compact notes only, no JSON. Do not invent quotes, review counts or prices.',
    tools: [{ googleSearch: {} }],
    maxOutputTokens: 2048,
  }));
}

async function kronikCikar(ad, kategori, notlar, lang, mevcutMetin, kardesBulgular = '') {
  const txt = await tekrarli(() => gemini({
    system: `You are Qor AI's community-research analyst. Return only valid JSON in language code ${lang}. `
      + `${P.languageGate(lang)} `
      // Dil kapisinin TEK istisnasi: `evidence` alani makine tarafindan
      // notlarla karsilastiriliyor, okuyucuya hic gosterilmiyor.
      + 'EXCEPTION: the `evidence` field is not user-facing text. Leave it in the original language of the research notes, copied verbatim; never translate it.',
    user: `Product: "${ad}"${kategori ? ` (category: ${kategori})` : ''}\n\n`
      + `RESEARCH NOTES:\n${notlar}\n\n`
      + 'From these notes, extract the CHRONIC PROBLEMS: recurring failures owners report AFTER living with the product — '
      + 'a defect pattern, a bad batch or revision, degradation over time, a firmware/driver regression, an RMA or support breakdown. '
      + 'A chronic issue is NOT a spec-sheet drawback: price, weight, size, a missing accessory, a port count, ecosystem lock-in and "only 8 GB RAM" are NOT chronic issues.\n'
      // KATEGORI GENELLEMESI SIZMASIN. Arastirma notlari kasten kategori
      // capalarini tek tek geziyor ("laptoplarda mentese catlar mi? bu modelde
      // kanit yok") ve model o capayi BULGU sanip listeye tasiyordu — canli
      // MacBook Neo TR kaydinda "Pil Sismesi" ve "Mentese Gurultusu" tam boyle
      // cikti. Notlar artik her adayi [MODEL-SPECIFIC] / [CATEGORY-GENERAL]
      // diye ETIKETLIYOR (bkz. chronicResearchGate); burasi yalniz ilkini alir.
      + '\nThe notes label each candidate [MODEL-SPECIFIC] or [CATEGORY-GENERAL]. Extract ONLY the [MODEL-SPECIFIC] ones. '
      + 'Drop every [CATEGORY-GENERAL] item, everything the notes describe as a general property of the category or as standard advice, '
      + 'and every anchor the notes say was searched but not tied to this model. If the notes carry no labels, apply the same test yourself.\n'
      // KANIT CEVRILMEZ. Ilk surumde `evidence` de dil kapisina giriyordu:
      // model TR kosusunda dayanak cumlesini Turkceye ceviriyor, kanit kapisi
      // Ingilizce notlarda karsiligini bulamiyor ve TUM maddeler dusuyordu
      // ("araştırma tekrar eden bir arıza bulmadı" — oysa EN kosusu ayni
      // notlardan 4 madde cikarmisti). `evidence` notlarin KENDI dilinde kalir.
      + 'For each item you return, also return `evidence`: one sentence COPIED VERBATIM from the research notes above that ties this failure to this exact model. '
      + 'Copy `evidence` in the ORIGINAL LANGUAGE OF THE NOTES — do NOT translate it. It is a machine-checked citation, not text for the reader. '
      + 'Every other field is translated normally.\n'
      // Ayni urunun iki dildeki raporu AYNI OLGULARI tasimali; dil yalnizca
      // anlatimi degistirir. Kardes dilde dogrulanmis bulgu buraya tasinir.
      + (kardesBulgular
        ? `\nThese chronic issues were already verified for this exact model in the other-language version of the same report. Carry them over (translated, rewritten in your own words) unless the research notes contradict them:\n${kardesBulgular}\n`
        : '')
      + (mevcutMetin
        ? `\nThese facts are ALREADY stated elsewhere in the report — do not repeat any of them:\n${mevcutMetin}\n`
        : '')
      + '\nReturn ONLY this JSON:\n'
      + '{"chronicIssues": [{"title": "short name of the recurring problem", "detail": "1-2 sentences: what fails, how far into ownership, whether a fix or workaround exists", "frequency": "widespread|common|occasional", "evidence": "the sentence from the notes, copied verbatim, that ties this failure to THIS model"}]}\n'
      + 'Return 2-5 items. If the notes genuinely report that a search was run and no recurring problem was found, return {"chronicIssues": []} — never invent one.',
    json: true,
    maxOutputTokens: 2048,
    temperature: 0.25,
  }));
  const parsed = P.parseAiJson(txt);
  return arr(parsed?.chronicIssues)
    .map((x) => ({
      title: String(x?.title || '').trim(),
      detail: String(x?.detail || '').trim(),
      frequency: ['widespread', 'common', 'occasional'].includes(String(x?.frequency || '').toLowerCase())
        ? String(x.frequency).toLowerCase() : 'occasional',
      _kanit: String(x?.evidence || '').trim(),
    }))
    .filter((x) => x.title && x.detail)
    // KANIT KAPISI — talimat degil, OLCUM. "Yalniz [MODEL-SPECIFIC] olanlari
    // al" talimatina model her zaman uymuyor (canli MacBook Neo TR kaydinda
    // "Pil Sismesi" ve "Mentese Gurultusu" tam boyle sizdi), ama dayanak diye
    // gosterdigi cumlenin notlarda GERCEKTEN gecip gecmedigi olculebilir.
    // Kardes dilden tasinan bulgunun dayanagi bu koşunun notlarinda olmayabilir
    // — o zaten oteki dilde dogrulanmisti, ona ayri gecis verilir.
    .filter((x) => {
      if (!x._kanit) return false;
      if (kardesBulgular && ortakOran(x.title, kardesBulgular) >= 0.5) return true;
      return ortakOran(x._kanit, notlar) >= 0.6;
    })
    .map(({ _kanit, ...x }) => x)
    .slice(0, 5);
}

// Raporun BASKA yerlerinde zaten yazili olan olgular — cikarim onlari tekrar
// etmesin. `dropRestated` render tarafinda zaten suzuyor; ayni maddeyi
// urettirip sonra suzmek "kronik sorun bulunamadi" gibi gorunmeye yol aciyor.
function mevcutOlgular(govde, rapor) {
  const p = obj(rapor?.product) || {};
  const satir = (x) => (typeof x === 'string' ? x : `${x?.title || ''} ${x?.detail || ''}`).trim();
  return [
    ...arr(p.weaknesses).map(satir),
    ...arr(p.criticalPoints).map(satir),
    ...arr(p.reliabilityNotes).map(satir),
    ...arr(govde.community?.lovedFeatures).map(satir),
  ].filter(Boolean).slice(0, 20).map((s) => `- ${s}`).join('\n');
}

/**
 * KARDES DILDEKI kronik sorunlar — ayni kayit, ayni urun govdesi, oteki dil.
 *
 * Bir olgu ("macOS Tahoe bellek sizintisi") urune aittir, dile degil. Canli
 * kayitta MacBook Neo'nun EN raporunda vardi, TR raporunda yoktu; iki ayri
 * arastirma kostugu icin iki farkli gercek uretiliyordu. Kardes bulgu
 * cikarima KANIT olarak verilir, korukorune kopyalanmaz — arastirma onu
 * yalanlarsa dusurulur.
 */
function kardesKronik(kayit, lang, yol) {
  const other = lang === 'tr' ? 'en' : 'tr';
  const rapor = obj(kayit[`report_${other}`]);
  if (!rapor) return '';
  const es = bodies(rapor).find((g) => g.yol === yol);
  return arr(es?.community?.chronicIssues)
    .map((x) => `- ${String(x?.title || '').trim()}: ${String(x?.detail || '').trim()}`)
    .filter((s) => s.length > 4)
    .join('\n');
}

// ── Ana akis ──────────────────────────────────────────────────────────────
async function main() {
  await pbAuth();
  const { url } = pbCreds();
  const liste = await (await fetch(`${url}/api/collections/analyses/records?perPage=200&sort=-publishedAt`, {
    headers: { Authorization: token },
  })).json();

  const kayitlar = arr(liste.items).filter((a) => (ONLY_SLUG.length ? ONLY_SLUG.includes(a.slug) : true));
  console.log(`${kayitlar.length} kayit incelenecek${APPLY ? ' (YAZILACAK)' : ' (kuru koşu)'}\n`);

  let onarilan = 0;
  let atlanan = 0;

  for (const a of kayitlar) {
    // Hangi dillerde kronik listesi bos? Once bunu bul, arastirmayi ancak
    // gerekiyorsa kostur — grounded cagri pahali ve limitli.
    const eksik = [];
    for (const lang of LANGS) {
      const rapor = obj(a[`report_${lang}`]);
      if (!rapor) continue;
      for (const g of bodies(rapor)) {
        if (FORCE || !arr(g.community.chronicIssues).length) eksik.push({ lang, rapor, govde: g });
      }
    }
    if (!eksik.length) { atlanan += 1; continue; }

    const ad = eksik[0].govde.ad || a.productName || arr(a.subjectNames)[0] || a.slug;
    const kategori = a.category || '';
    console.log(`▸ ${a.slug}  (${kategori || '-'})  eksik: ${eksik.map((e) => `${e.lang}/${e.govde.ad || '·'}`).join(', ')}`);

    // Abonelik kayitlarinda "urun" yok; kronik sorun servis adiyla aranir.
    let notlar = '';
    try {
      notlar = await kronikArastir(ad, kategori || (a.kind === 'subscription' ? 'subscription service' : ''));
    } catch (e) {
      console.log(`  ! arastirma basarisiz: ${e.message}`);
      continue;
    }
    console.log(`  araştırma: ${notlar.length} karakter`);
    if (DEBUG) console.log(notlar.replace(/^/gm, '      | '));

    const yazilacak = {};
    for (const { lang, rapor, govde } of eksik) {
      let bulunan = [];
      try {
        bulunan = await kronikCikar(
          govde.ad || ad, kategori, notlar, lang,
          mevcutOlgular(govde, rapor),
          // --force ile KARDES BULGU BESLENMEZ: amac zaten kirli listeyi
          // yeniden uretmek, oteki dilde duran ayni kirliligi kanit kapisindan
          // gecirmek degil.
          FORCE ? '' : kardesKronik(a, lang, govde.yol),
        );
      } catch (e) {
        console.log(`  ! ${lang} çıkarım başarısız: ${e.message}`);
        continue;
      }
      // BOS SONUC: normalde dokunma — kayitta duran liste bu kosunun
      // uretemediginden iyidir. AMA --force ile amac zaten listeyi KANITA
      // dayali olarak yeniden uretmek; orada eskisini birakmak, kanit
      // kapisindan gecmemis bir listeyi yayinda tutmak demek olurdu.
      if (!bulunan.length) {
        if (!FORCE || !arr(govde.community.chronicIssues).length) {
          console.log(`  · ${lang}: araştırma tekrar eden bir arıza bulmadı — dokunulmadı`);
          continue;
        }
        console.log(`  − ${lang}: kanıtlanamadı → ${arr(govde.community.chronicIssues).length} eski madde TEMİZLENDİ`);
      } else {
        console.log(`  + ${lang}: ${bulunan.length} kronik sorun`);
      }
      // KURU KOSUDA TAM METIN. Baslik saymak dogrulama degil — kategori
      // capalarinin ("laptoplarda mentese catlar") bu MODELE ait bir bulguymus
      // gibi yazilip yazilmadigi ancak detay okunarak anlasilir.
      if (!APPLY || DEBUG) bulunan.forEach((x) => console.log(`      · [${x.frequency}] ${x.title} — ${x.detail}`));
      else console.log(`      ${bulunan.map((x) => x.title).join(' · ')}`);
      // Ayni rapor objesi uzerinde birden fazla govde olabilir (karsilastirma).
      const kopya = yazilacak[`report_${lang}`] || JSON.parse(JSON.stringify(rapor));
      setPath(kopya, `${govde.yol}.chronicIssues`, bulunan);
      yazilacak[`report_${lang}`] = kopya;
      await sleep(400);
    }

    if (!Object.keys(yazilacak).length) continue;
    if (!APPLY) { onarilan += 1; continue; }

    const res = await pb('PATCH', `/api/collections/analyses/records/${a.id}`, yazilacak);
    if (res.status >= 400) {
      console.log(`  ! PB yazma hatası ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      continue;
    }
    console.log('  ✓ kaydedildi');
    onarilan += 1;
    await sleep(600);
  }

  console.log(`\n${onarilan} kayıt ${APPLY ? 'onarıldı' : 'onarılacak'}, ${atlanan} kayıt zaten tamdı.`);
  if (!APPLY && onarilan) console.log('Yazmak için: node web/scripts/fix-chronic-issues.mjs --apply');
}

main().catch((e) => { console.error(e); process.exit(1); });
