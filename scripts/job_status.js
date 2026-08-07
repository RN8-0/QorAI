#!/usr/bin/env node
/**
 * Zamanlanmis islerin durumunu ve GECMISINI PocketBase'e yazar; admin paneli
 * Scraper sekmesi bunu okur. Kullanici (2026-08-07): "admin panele giriste
 * terminalden yapilan islemler gozukecek ve gecmis kayitlari olacak scraper
 * sekmesinde."
 *
 * Neden ayri bir betik: .cmd zinciri her adimda bunu cagirir, boylece panel
 * "su an hangi adimdayiz" bilgisini terminale bakmadan gosterir. Islerin
 * kendisi PB'ye yazmak zorunda kalmaz.
 *
 * Depolama: public_config koleksiyonunda TEK kayit (key = 'job_runs'), value
 * icinde son N kosu. Ayri bir koleksiyon acmak Coolify tarafinda semа degisikligi
 * gerektiriyor; public_config zaten var ve panel onu okuyabiliyor.
 *
 *   node scripts/job_status.js start   <is>
 *   node scripts/job_status.js step    <is> "adim adi"
 *   node scripts/job_status.js finish  <is>
 *   node scripts/job_status.js fail    <is> "hata"
 */
const { req } = require('../migration/pb');

const KEY = 'job_runs';
const MAX_RUNS = 20;          // panelde gosterilecek gecmis kosu sayisi
const MAX_STEPS = 40;         // tek kosuda saklanacak adim sayisi

const [, , action, job = 'weekly', detail = ''] = process.argv;

function nowIso() { return new Date().toISOString(); }

async function loadDoc() {
  const r = await req('GET',
    `/api/collections/public_config/records?perPage=1&skipTotal=1&filter=${encodeURIComponent(`key="${KEY}"`)}`);
  const item = (r.body && r.body.items && r.body.items[0]) || null;
  let value = { runs: [] };
  if (item) {
    const raw = item.value;
    if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { value = { runs: [] }; } }
    else if (raw && typeof raw === 'object') value = raw;
  }
  if (!Array.isArray(value.runs)) value.runs = [];
  return { id: item ? item.id : '', value };
}

async function saveDoc(id, value) {
  // public_config.value alanini bazi kurulumlar JSON, bazilari text tutuyor.
  // Once nesne olarak dene, 400 alirsak string'e dus.
  const bodies = [{ key: KEY, value }, { key: KEY, value: JSON.stringify(value) }];
  for (const body of bodies) {
    const r = id
      ? await req('PATCH', `/api/collections/public_config/records/${id}`, body)
      : await req('POST', '/api/collections/public_config/records', body);
    if (r.status === 200 || r.status === 201) return r.body.id || id;
  }
  throw new Error('job_status: public_config yazilamadi');
}

(async () => {
  const { id, value } = await loadDoc();
  const runs = value.runs;
  let current = runs.find((r) => r.job === job && r.status === 'running');

  if (action === 'start') {
    // Yarim kalmis onceki kosu varsa (PC kapandi / cokme) "kesildi" olarak kapat,
    // yoksa panelde sonsuza kadar "calisiyor" gorunur.
    for (const r of runs) {
      if (r.job === job && r.status === 'running') {
        r.status = 'interrupted';
        r.finishedAt = nowIso();
      }
    }
    runs.unshift({
      job, status: 'running', startedAt: nowIso(), finishedAt: '',
      steps: [], host: process.env.COMPUTERNAME || 'pc',
    });
  } else if (!current) {
    // start gormeden step/finish geldi (elle kosu) - tolere et.
    runs.unshift({ job, status: 'running', startedAt: nowIso(), finishedAt: '', steps: [] });
    current = runs[0];
  }

  current = runs.find((r) => r.job === job && r.status === 'running');

  if (action === 'step' && current) {
    const prev = current.steps[current.steps.length - 1];
    if (prev && !prev.finishedAt) prev.finishedAt = nowIso();
    current.steps.push({ name: detail || 'adim', startedAt: nowIso(), finishedAt: '' });
    if (current.steps.length > MAX_STEPS) current.steps.splice(0, current.steps.length - MAX_STEPS);
  } else if (action === 'finish' && current) {
    const prev = current.steps[current.steps.length - 1];
    if (prev && !prev.finishedAt) prev.finishedAt = nowIso();
    current.status = 'ok';
    current.finishedAt = nowIso();
  } else if (action === 'fail' && current) {
    current.status = 'error';
    current.error = String(detail || '').slice(0, 500);
    current.finishedAt = nowIso();
  }

  value.runs = runs.slice(0, MAX_RUNS);
  value.updatedAt = nowIso();
  await saveDoc(id, value);
  console.log(`[job_status] ${action} ${job}${detail ? ' - ' + detail : ''}`);
})().catch((err) => {
  // Durum yazamamak ISI DURDURMAMALI - sadece raporlama.
  console.log('[job_status] yazilamadi: ' + err.message);
  process.exit(0);
});
