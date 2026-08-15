import { useEffect, useState } from 'react';

const KEY = 'qorai-theme';

// getTheme() SABİT 'light' DÖNÜYORDU: kayıtlı tercih hiçbir yerde okunmuyordu
// (repoda `qorai-theme` ile tek eşleşme bu dosyaydı) ve aşağıdaki effect her
// yüklemede kullanıcının seçimini 'light' ile EZİYORDU. Davranışsal ölçüm:
//   tıkla        → {theme:"dark",  kayit:"dark"}
//   YENİLE       → {theme:"light", kayit:"light"}   ← tercih yok edildi
// Yani başlıktaki 🌙 düğmesi bir kez çalışıp ilk yenilemede sıfırlanıyordu —
// CSS'te tam bir karanlık tema hazır dururken.
//
// Sıra: KAYITLI tercih → AÇIK. index.html'deki satır içi script AYNI sırayı
// boyamadan önce uyguluyor; ikisi ayrışırsa karanlık tema kullanıcısı her
// açılışta beyaz bir flaş görür, o yüzden birlikte değiştirin.
//
// İŞLETİM SİSTEMİ TERCİHİ BİLEREK OKUNMUYOR (2026-08-15 kararı): sitenin
// varsayılan yüzü açık tema. Cihazı karanlık modda olan ziyaretçi de siteyi
// açık görür; karanlık temayı başlıktaki düğmeyle kendisi seçer ve o seçim
// `qorai-theme` ile kalıcı olur. `prefers-color-scheme` buraya geri eklenirse
// varsayılan yine cihaza devrolur — eklemeyin.
export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* storage blocked */ }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Tarayıcı arayüzü (adres çubuğu) de temayla uyumlu olsun; aksi halde
    // karanlık temada üstte parlak beyaz bir şerit kalıyor.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#F8FAFC');
    try { localStorage.setItem(KEY, theme); } catch { /* noop */ }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle, set: setTheme };
}
