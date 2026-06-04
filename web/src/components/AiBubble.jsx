import { useState, useRef, useEffect } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { useT } from '../i18n/index.jsx';
import './AiBubble.css';

export default function AiBubble() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const greetingRef = useRef(null);
  if (!greetingRef.current) greetingRef.current = { role: 'model', text: t('ai.greeting') };
  const [msgs, setMsgs] = useState(() => [greetingRef.current]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);

  const suggestions = [t('ai.s1'), t('ai.s2'), t('ai.s3')];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy, open]);

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
      const reply = await askQorAi(next.filter((m, i) => !(i === 0 && m === greetingRef.current)));
      setMsgs((m) => [...m, { role: 'model', text: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: t('ai.errReply') }]);
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
        aria-label="Qor AI"
      >
        {open ? '✕' : <img src="/assets/qor_logo_512.png" alt="" />}
        {!open && <span className="aib-fab-pulse" />}
      </button>

      {open && (
        <div className="aib-panel fade-up">
          <div className="aib-head">
            <div className="aib-head-id">
              <img src="/assets/qor_logo_512.png" alt="Qor AI" />
              <div>
                <strong>Qor AI</strong>
                <span>{t('ai.subtitle')}</span>
              </div>
            </div>
            <button className="aib-head-x" onClick={() => setOpen(false)} aria-label="✕">✕</button>
          </div>

          <div className="aib-msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={'aib-msg ' + m.role}>{m.text}</div>
            ))}
            {busy && (
              <div className="aib-msg model aib-typing"><span /><span /><span /></div>
            )}
            {msgs.length === 1 && (
              <div className="aib-suggest">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <form className="aib-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.placeholder')}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="→">
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
