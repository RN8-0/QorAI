import { useEffect, useState } from 'react';
import './AiFabLite.css';

// Qor balonunun HAFİF karşılığı — yalnızca yuvarlak düğmeyi çizer.
//
// NEDEN: AiBubble kapalıyken bile devasa bir bağımlılık ağacı indiriyordu.
// Kapsam ölçümü (Chrome coverage, canlı ana sayfa, balon hiç açılmadan):
//     AiText-*.js     107 KB  — %8 kullanılıyor
//     AiAnalysis-*.js  41 KB  — %3
//     AiReportView     11 KB  — %3
//     4 adet job modülü ~15 KB
//     AiText.css 14 KB + AiAnalysis.css 20 KB — %0 (tek bir kuralı bile kullanılmıyor)
// Yani her ziyaretçi, hiç dokunmayacağı bir sohbet paneli için ~180 KB JS ve
// 34 KB CSS indirip AYRIŞTIRIYORDU. `AiText.jsx`in kaynağı 1,1 KB; 107 KB'lık
// dosya rollup'ın PAYLAŞILAN chunk'ı — sadece adı AiText, içinde tüm AI analiz
// ağacı var. Bu yüzden "AiBubble'ı lazy yapmak" yetmedi: bileşen koşulsuz
// render edildiği için chunk yine ilk yüklemede iniyordu.
//
// Gerçek balon YALNIZCA (a) kullanıcı düğmeye dokununca, ya da (b) arka planda
// çalışan bir analiz varsa yükleniyor. (b) localStorage'dan tek satırda
// anlaşılıyor — bildirim davranışı korunuyor, hiçbir chunk peşin inmiyor.
export const ACTIVE_JOB_KEYS = [
  'qor.linkAnalysis.activeJob',
  'qor.subscriptionAnalysis.activeJob',
  'qor.compareAnalysis.activeJob',
  'qor.productAnalysis.activeJob',
];

export function hasActiveAnalysis() {
  try {
    return ACTIVE_JOB_KEYS.some((k) => {
      const raw = localStorage.getItem(k);
      return !!raw && raw !== 'null' && raw !== '{}';
    });
  } catch { return false; }
}

export default function AiFab({ onOpen }) {
  // Düğme ilk karede görünür; ağır balon yalnızca dokunulunca gelir.
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (pressed) onOpen(); }, [pressed, onOpen]);
  return (
    <button
      className="aib-fab"
      onClick={() => setPressed(true)}
      aria-label="Qor AI"
      title="Qor AI"
    >
      <img src="/assets/qor_logo_144.png?v=20260814a" alt="" width="35" height="35" />
      <span className="aib-fab-pulse" />
    </button>
  );
}
