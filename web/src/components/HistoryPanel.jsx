import { useEffect, useState } from 'react';
import { pb } from '../lib/pocketbase';
import { getSavedAnalyses } from '../lib/pbHistory';
import { useAuth } from '../lib/auth';
import SubLogo from './SubLogo.jsx';
import './HistoryPanel.css';

// Shared history panel for the Link Analysis and Subscriptions pages —
// mirrors the app's link_analysis_history_screen / subscription_history_screen:
// same `saved_analyses` records the app writes, newest first, tap to reopen,
// swipe-to-delete becomes a × button on the web.

function fmtDate(iso, lang) {
  const n = Date.parse(iso || '');
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(n));
  } catch { return iso.slice(0, 10); }
}

export default function HistoryPanel({ kind, lang, onOpen, refreshToken = 0 }) {
  const { user } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [items, setItems] = useState(null); // null = loading
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!user) { setItems([]); return undefined; }
    getSavedAnalyses(60).then((all) => {
      if (!alive) return;
      setItems(all.filter((a) => a.kind === kind).slice(0, 20));
    }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [user, kind, refreshToken]);

  if (!user || !items || items.length === 0) return null;

  async function remove(e, id) {
    e.stopPropagation();
    setItems((list) => list.filter((x) => x.id !== id));
    try { await pb.collection('saved_analyses').delete(id); } catch { /* best effort */ }
  }

  return (
    <section className="hist-panel">
      <button type="button" className="hist-head" onClick={() => setOpen((o) => !o)}>
        <span className="hist-head-title">
          🕘 {L('History', 'Geçmiş', 'Verlauf')}
          <small>{items.length}</small>
        </span>
        <span className={'hist-caret' + (open ? ' open' : '')}>▾</span>
      </button>
      {open && (
        <div className="hist-list fade-up">
          {items.map((it) => {
            const names = it.services.length ? it.services : (it.urls.length ? it.urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }) : []);
            return (
              <button type="button" key={it.id} className="hist-item" onClick={() => onOpen(it)}>
                <span className="hist-logos">
                  {names.slice(0, 3).map((n) => <SubLogo key={n} name={n} size={28} radius={8} />)}
                </span>
                <span className="hist-meta">
                  <b>{it.title || names.join(' vs ') || L('Analysis', 'Analiz', 'Analyse')}</b>
                  <small>{fmtDate(it.at, lang)}</small>
                </span>
                <span className="hist-del" role="button" tabIndex={-1}
                  title={L('Delete', 'Sil', 'Löschen')}
                  onClick={(e) => remove(e, it.id)}>×</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
