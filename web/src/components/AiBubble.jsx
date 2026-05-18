import { useState, useRef, useEffect } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import './AiBubble.css';

const GREETING = {
  role: 'model',
  text: 'Merhaba! Ben Qor AI 👋 Telefon, laptop, kulaklık ya da abonelik — ne arıyorsan sor, sana en uygununu bulalım.',
};

const SUGGESTIONS = [
  '50.000 TL altı en iyi telefon',
  'Oyun için laptop önerisi',
  'iPhone 15 mi Samsung S24 mü?',
];

export default function AiBubble() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy, open]);

  // Other components (e.g. the product page) can open the chat with a
  // ready-made question via a `qor-open-ai` custom event.
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      const q = e.detail;
      if (q && typeof q === 'string') setTimeout(() => sendRef.current?.(q), 120);
    };
    window.addEventListener('qor-open-ai', onOpen);
    return () => window.removeEventListener('qor-open-ai', onOpen);
  }, []);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setBusy(true);
    trackEvent('ai_chat_message');
    try {
      // Send only the real conversation turns (skip the static greeting).
      const reply = await askQorAi(next.filter((m, i) => !(i === 0 && m === GREETING)));
      setMsgs((m) => [...m, { role: 'model', text: reply }]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: 'model', text: 'Şu an yanıt veremedim 😕 Birazdan tekrar dener misin?' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  sendRef.current = send;

  return (
    <>
      <button
        className={'aib-fab' + (open ? ' open' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-label="Qor AI Sohbet"
      >
        {open ? '✕' : <img src="/assets/logo.png" alt="" />}
        {!open && <span className="aib-fab-pulse" />}
      </button>

      {open && (
        <div className="aib-panel fade-up">
          <div className="aib-head">
            <div className="aib-head-id">
              <img src="/assets/logo.png" alt="Qor AI" />
              <div>
                <strong>Qor AI</strong>
                <span>Yapay zekâ danışman</span>
              </div>
            </div>
            <button className="aib-head-x" onClick={() => setOpen(false)} aria-label="Kapat">✕</button>
          </div>

          <div className="aib-msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={'aib-msg ' + m.role}>
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="aib-msg model aib-typing">
                <span /><span /><span />
              </div>
            )}
            {msgs.length === 1 && (
              <div className="aib-suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <form
            className="aib-input"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir şey sor…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Gönder">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
