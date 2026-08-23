#!/usr/bin/env node
/**
 * ISCI KIRALAMASI — "bu isi HANGI PC kosturuyor?"
 *
 * NEDEN VAR: fiyat isleri Hetzner'dan PC'ye tasindi (Amazon datacenter IP'sine
 * dort pazarda birden bot duvari cikariyor; ayni sinif sorun Epey'de de var).
 * PC'ye tasiyinca yeni bir sorun dogdu: repo baska bir PC'ye klonlanip
 * gorevler orada da kurulursa IKI PC ayni anda ayni urunleri tarar. Bu yalnizca
 * israf degil — ayni PB kayitlarina paralel yazip birbirinin rollup damgasini
 * ezerler ve iki taraf da Amazon'a ayni anda vurup bot duvarini kendileri
 * tetikler.
 *
 * COZUM: PocketBase'de TEK bir kiralama kaydi. Bir PC isi kosturmadan once
 * kiralamayi ISTER; sahibi baskasiysa ve o sahip HAYATTAYSA, sessizce cekilir.
 *
 * "HAYATTA" NE DEMEK: her kosu ve calisan proxy kiralamaya kalp atisi yazar.
 * Esik 26 SAAT — bir gecelik kapali PC sahipligi kaybetmesin diye bilerek
 * uzun. Daha kisa bir esik (or. 2 saat) PC her kapandiginda sahipligin el
 * degistirmesine, yani iki PC arasinda gidip gelmeye yol acardi.
 *
 * DEVIR: esik asilinca yeni PC kendiliginden devralir. Beklemeden devretmek
 * icin admin panelindeki "bu PC'yi isci yap" dugmesi `--force` kullanir.
 *
 * Kullanim:
 *   node scripts/worker_lease.js claim  price          -> cikis 0 = is bende
 *                                                          cikis 1 = baskasinda
 *   node scripts/worker_lease.js claim  price --force   -> zorla devral
 *   node scripts/worker_lease.js beat   price           -> kalp atisi
 *   node scripts/worker_lease.js release price
 *   node scripts/worker_lease.js status price           -> JSON
 *
 * .cmd zincirinde KULLANIM KALIBI (qorai_lock.cmd ile ayni bicim):
 *   call :lease price || exit /b 0
 * Cikis kodu 1 ise "hata" degil "benim isim degil" demektir; gorev sessizce
 * biter, log'a tek satir yazar.
 */
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { req } = require('../migration/pb');

const KEY = 'worker_leases';
// Bir gecelik kapali PC sahipligi kaybetmesin: esik BIR GUNDEN uzun.
const STALE_MS = 26 * 60 * 60 * 1000;

const [, , action = 'status', role = 'price', ...bayraklar] = process.argv;
const FORCE = bayraklar.includes('--force');

/**
 * MAKINE KIMLIGI — DETERMINISTIK, dosyaya YAZILMAZ.
 *
 * ILK SURUM rastgele bir id uretip `%LOCALAPPDATA%\QorAI\worker-id` dosyasina
 * yaziyordu. Kabuktan calistirinca dogru okuyordu ama GOREV ZAMANLAYICISINDAN
 * calisinca her seferinde YENI id uretiyordu — olculdu: ayni kullanici, ayni
 * LOCALAPPDATA degeri, farkli sonuc. Sonucu sessiz ve olumculdu: gece gorevi
 * kendini "baska PC" sanip her koşuyu atliyordu.
 *
 * Kok nedeni kovalamak yerine bagimliligi kaldirdik. Kimlik artik SABIT iki
 * seyden turetiliyor: makine adi + repo yolunun ozeti. Ne dosyaya, ne ortam
 * degiskenine, ne de rastgeleye dokunuyor — `__dirname` sureci nasil
 * baslatilirsa baslatilsin ayni.
 *
 * Yan faydasi: repo ayni yola YENIDEN klonlansa bile id degismez, yani yeni
 * kurulum kiralamayi kaybetmez. Ayni PC'de iki AYRI klon iki ayri isci sayilir
 * — dogrusu da bu, cunku her klonun kendi zamanlanmis gorevleri var.
 * Repo baska bir yola tasinirsa id degisir; panelde gorunur ve "bu PC'yi isci
 * yap" ile tek tikta duzelir.
 */
function workerId() {
  const kok = path.resolve(__dirname, '..');
  // Buyuk/kucuk harf ve ters bolu farklari ayni kurulumu iki farkli isci
  // gostermesin (Windows yollari "C:\..." ve "c:/..." olarak gelebiliyor).
  const nrm = kok.replace(/\\/g, '/').toLowerCase();
  const ozet = crypto.createHash('sha1').update(nrm).digest('hex').slice(0, 8);
  return `${os.hostname()}-${ozet}`;
}

function nowIso() { return new Date().toISOString(); }

async function loadDoc() {
  const r = await req('GET',
    `/api/collections/public_config/records?perPage=1&skipTotal=1&filter=${encodeURIComponent(`key="${KEY}"`)}`);
  const item = (r.body && r.body.items && r.body.items[0]) || null;
  let value = {};
  if (item) {
    const raw = item.value;
    if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { value = {}; } }
    else if (raw && typeof raw === 'object') value = raw;
  }
  return { id: item ? item.id : '', value: value && typeof value === 'object' ? value : {} };
}

async function saveDoc(id, value) {
  // public_config.value bazi kurulumlarda JSON, bazilarinda text — job_status.js
  // ile AYNI iki asamali yazma.
  const bodies = [{ key: KEY, value }, { key: KEY, value: JSON.stringify(value) }];
  for (const body of bodies) {
    const r = id
      ? await req('PATCH', `/api/collections/public_config/records/${id}`, body)
      : await req('POST', '/api/collections/public_config/records', body);
    if (r.status === 200 || r.status === 201) return (r.body && r.body.id) || id;
  }
  throw new Error('worker_lease: public_config yazilamadi');
}

function bayat(lease) {
  if (!lease || !lease.lastSeenAt) return true;
  const t = Date.parse(lease.lastSeenAt);
  return !Number.isFinite(t) || (Date.now() - t) > STALE_MS;
}

(async () => {
  const me = workerId();
  const { id, value } = await loadDoc();
  const mevcut = value[role] || null;
  const benim = mevcut && mevcut.workerId === me;

  if (action === 'status') {
    process.stdout.write(JSON.stringify({
      role,
      me,
      hostName: os.hostname(),
      owner: mevcut || null,
      mine: Boolean(benim),
      stale: bayat(mevcut),
      // Devralabilir miyim: sahibi yoksa, benimse ya da bayatsa.
      canClaim: !mevcut || Boolean(benim) || bayat(mevcut),
      staleAfterHours: STALE_MS / 3600000,
    }, null, 2));
    return;
  }

  if (action === 'release') {
    if (benim) {
      delete value[role];
      await saveDoc(id, value);
      console.log(`worker_lease: ${role} birakildi (${me})`);
    }
    return;
  }

  if (action === 'claim' || action === 'beat') {
    // BASKASININ HAYATTAKI kiralamasina dokunma.
    if (mevcut && !benim && !bayat(mevcut) && !FORCE) {
      console.log(`worker_lease: ${role} baska bir PC'de — ${mevcut.hostName || mevcut.workerId}`
        + ` (son goruldu ${mevcut.lastSeenAt}). Bu PC atliyor.`);
      process.exit(1);
    }
    // `beat` yalnizca TAZELER; sahibi degilsem sessizce cikar. Kalp atisini
    // devralma yoluna cevirmek, calisan proxy'nin farkinda olmadan isi
    // baska PC'den calmasi demek olurdu.
    if (action === 'beat' && !benim && !FORCE) {
      process.exit(1);
    }
    const devir = Boolean(mevcut && !benim);
    value[role] = {
      workerId: me,
      hostName: os.hostname(),
      repoPath: path.resolve(__dirname, '..'),
      claimedAt: benim && mevcut.claimedAt ? mevcut.claimedAt : nowIso(),
      lastSeenAt: nowIso(),
    };
    await saveDoc(id, value);
    if (action === 'claim') {
      console.log(devir
        ? `worker_lease: ${role} DEVRALINDI (${mevcut.hostName || mevcut.workerId} -> ${os.hostname()})`
        : `worker_lease: ${role} bu PC'de (${os.hostname()})`);
    }
    return;
  }

  console.error(`worker_lease: bilinmeyen komut "${action}" (claim|beat|release|status)`);
  process.exit(2);
})().catch((e) => {
  // PB'ye ULASILAMIYORSA isi ENGELLEME. Kiralama bir eniyilestirme, guvenlik
  // kapisi degil; ag sorunu yuzunden gece fiyat kosusunu kacirmak, iki PC'nin
  // ayni isi yapmasindan daha pahali.
  console.error(`worker_lease: kontrol edilemedi (${e.message}) — is yine de kosuyor`);
  process.exit(0);
});
