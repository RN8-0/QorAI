// Arka planda koşan analizlerin TEK toplama noktası.
//
// Kullanıcı isteği (2026-08-07): "kullanıcı bir quiz veya analiz işlemi
// başlattığında farklı sayfalarda gezinebilecek, o analiz arkaplanda devam
// edecek animasyonu ile beraber, hazır olduğunda Qor AI chat'te ünlem çıkacak
// ve tıklayınca direkt ulaşabilecek." (Mobil uygulamadaki analysisHubProvider
// davranışının web karşılığı.)
//
// İŞİN YARISI ZATEN VARDI: link ve abonelik analizleri modül seviyesinde bir
// iş deposunda koşuyor (linkAnalysisJobs / subscriptionAnalysisJobs), yani
// sayfa değiştirince İPTAL OLMUYOR. Eksik olan tek şey GÖRÜNÜRLÜKTÜ —
// kullanıcı başka bir sayfadayken işin bittiğini anlamıyordu. Bu modül iki
// depoyu dinleyip tek bir "meşgul / hazır" durumu üretir; Qor balonu onu çizer.
import { useSyncExternalStore } from 'react';
import { subscribeLinkAnalysisJob } from './linkAnalysisJobs';
import { subscribeSubscriptionAnalysisJob } from './subscriptionAnalysisJobs';
import { subscribeCompareAnalysisJob } from './compareAnalysisJobs';
import { subscribeProductAnalysisJob } from './productAnalysisJobs';

// Hazır sayılan aşamalar: kullanıcının DÖNÜP BAKMASI gereken durumlar.
// `quiz` de dahil — quiz hazır demek "senden cevap bekleniyor" demektir ve
// bu, sonuç kadar aciliyet taşır (mobilde de böyle).
const READY_PHASES = new Set(['quiz', 'result']);
const BUSY_PHASES = new Set(['identifying', 'quizLoading', 'analyzing', 'running']);

const SEEN_KEY = 'qor.analysisHub.seen';

let state = { busy: [], ready: [] };
let snapshot = state;
const listeners = new Set();
const jobs = { link: null, subscription: null, compare: null, product: null };

function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch { return new Set(); }
}

function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-30))); } catch { /* storage kapalı */ }
}

const META = {
  link: { path: '/link-analysis', labels: ['Link analysis', 'Link analizi', 'Link-Analyse'] },
  subscription: { path: '/subscriptions', labels: ['Subscription analysis', 'Abonelik analizi', 'Abo-Analyse'] },
  // Bu ikisinin adresi işe göre değişir (hangi ürün / hangi karşılaştırma),
  // bu yüzden yol iş kaydından okunur; META yalnızca etiketi ve yedek yolu verir.
  compare: { path: '/compare', labels: ['Comparison analysis', 'Karşılaştırma analizi', 'Vergleichsanalyse'] },
  product: { path: '/product', labels: ['Product analysis', 'Ürün analizi', 'Produktanalyse'] },
};

// İşin kullanıcıyı götüreceği adres. Ürün analizi kendi ürün sayfasına,
// karşılaştırma /compare'e döner (liste zaten localStorage'da duruyor).
// Bildirime tiklayinca ANALIZ acilmali — sayfanin varsayilan sekmesi degil.
// `?tab=ai` hicbir sayfada okunmuyordu: urun sayfasi 'premium' sekmesini,
// karsilastirma 'ai' sekmesini bekliyor. Kullanici baloncuga basinca urun /
// karsilastirma sayfasinin ilk sekmesine dusuyordu.
function pathFor(kind, job) {
  if (kind === 'product' && job.productPath) return `${job.productPath}?view=analysis`;
  if (kind === 'compare') {
    // Karşılaştırma havuzu (localStorage) bu arada boşaltılmış olabilir; havuz
    // boşken /compare ANA SAYFAYA yönlendirir ve rapor kaybolur (ölçüldü
    // 2026-08-09). Bu yüzden analizin ürün id'leri adresin İÇİNE yazılır ve
    // Compare.jsx havuzu bunlardan yeniden kurar.
    const ids = (job.productIds || []).filter(Boolean);
    const qs = ids.length ? `ids=${ids.join(',')}&view=analysis` : 'view=analysis';
    return `${META.compare.path}?${qs}`;
  }
  return META[kind].path;
}

function rebuild() {
  const seen = loadSeen();
  const busy = [];
  const ready = [];
  for (const [kind, job] of Object.entries(jobs)) {
    if (!job || !job.id) continue;
    const phase = String(job.phase || '');
    const entry = { kind, id: job.id, phase, path: pathFor(kind, job), labels: META[kind].labels };
    if (BUSY_PHASES.has(phase)) busy.push(entry);
    // Aynı iş için ünlem BİR KEZ: kullanıcı sonuca gittiyse bir daha yanmasın.
    else if (READY_PHASES.has(phase) && !seen.has(`${job.id}:${phase}`)) ready.push(entry);
  }
  const next = { busy, ready };
  const same = next.busy.length === state.busy.length
    && next.ready.length === state.ready.length
    && next.busy.every((b, i) => b.id === state.busy[i]?.id && b.phase === state.busy[i]?.phase)
    && next.ready.every((r, i) => r.id === state.ready[i]?.id && r.phase === state.ready[i]?.phase);
  if (same) return;
  state = next;
  snapshot = next;
  listeners.forEach((cb) => { try { cb(); } catch { /* dinleyici işi bozmasın */ } });
}

let started = false;
function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;
  subscribeLinkAnalysisJob((job) => { jobs.link = job; rebuild(); });
  subscribeSubscriptionAnalysisJob((job) => { jobs.subscription = job; rebuild(); });
  subscribeCompareAnalysisJob((job) => { jobs.compare = job; rebuild(); });
  subscribeProductAnalysisJob((job) => { jobs.product = job; rebuild(); });
}

/** Kullanıcı sonuca baktı → o iş için ünlemi söndür. */
export function markAnalysisSeen(kind) {
  const job = jobs[kind];
  if (!job || !job.id) return;
  const seen = loadSeen();
  seen.add(`${job.id}:${job.phase}`);
  saveSeen(seen);
  rebuild();
}

export function useAnalysisAlerts() {
  ensureStarted();
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => snapshot,
  );
}
