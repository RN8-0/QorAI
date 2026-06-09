// ─────────────────────────────────────────────────────────────────────────
//  AI analysis — web port of the mobile app's premium AI cards.
//  Same prompts (structured JSON) + same visuals: animated score ring,
//  strength/weakness bars, pros/cons cards, verdict, smart alternatives,
//  advisor and price prediction. Shared by the product detail + compare pages.
// ─────────────────────────────────────────────────────────────────────────
import './AiAnalysis.css';

const LANG_NAME = { tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian' };
function langName(lang) { return LANG_NAME[String(lang || 'en').slice(0, 2).toLowerCase()] || 'English'; }

function productLine(p, lang) {
  const ks = p?.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 18).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
  const priceFresh = Date.parse(p?.bestOfferExpiresAt || '') > Date.now();
  const price = priceFresh && Number(p?.lowestPrice) > 0 ? `${Number(p.lowestPrice)} ${p.lowestPriceCurrency || ''}` : '-';
  const name = p?.nameTranslated?.[String(lang).slice(0, 2)] || p?.name || '';
  return { name, brand: p?.brand || '', category: p?.category || '', score: p?.techScore || '-', price, ks };
}

// ─── Prompts — mirror lib/presentation/providers/cache_providers.dart ───────
export function buildDeepPrompt(p, lang) {
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  return (
    `You are a senior tech product analyst. The product name is exactly "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Do NOT assume any typo in the product name — use it exactly as given.\n\n' +
    `IMPORTANT: Return ONLY valid JSON. ALL text fields, list items, and the verdict MUST be fully written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "overallScore": <number 0-100>,\n  "strengths": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n' +
    '  "weaknesses": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n' +
    '  "pros": ["<pro1>", "<pro2>", "<pro3>"],\n  "cons": ["<con1>", "<con2>", "<con3>"],\n  "verdict": "<2-3 sentence final verdict>"\n}\n\n' +
    'Rules:\n- Provide 3-5 strengths and 2-4 weaknesses\n- Scores realistic and varied (not all 80-90)\n' +
    '- Pros/cons specific and informative (8-18 words each)\n- Verdict must include concrete evidence\n- Be honest and specific.\n\n' +
    `Context: techScore=${score}/100, approx price=${price}, key specs: ${ks || '-'}`
  );
}
export function buildAltPrompt(p, lang) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  return (
    `You are a senior tech product analyst. For the product "${name}" by ${brand || 'unknown'} (category: ${category}), suggest the 3 strongest real, currently-available alternatives.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)} (keep official product/model names as-is).\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "alternatives": [\n    {"name": "<product name>", "advantage": "<1 sentence why it can be better>", "tradeoff": "<1 sentence what you give up>", "priceComparison": "<cheaper/similar/pricier + short note>", "bestFor": "<who it fits>", "whyBetter": "<1 concrete spec-based reason>"}\n  ]\n}\n\n' +
    'Rules:\n- Exactly 3 alternatives, real models in the same category/segment\n- Be specific and grounded; no generic filler.\n\n' +
    `Context: approx price=${price}, key specs: ${ks || '-'}`
  );
}
export function buildAdvisorPrompt(p, lang, profile = {}) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 14).join('; ');
  return (
    `You are an AI product advisor. For "${name}" by ${brand || 'unknown'} (category: ${category}), give tailored buying advice.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "whoShouldBuy": "<2-3 sentences>",\n  "whoShouldAvoid": "<2-3 sentences>",\n  "reasonsToBuy": ["<r1>", "<r2>", "<r3>"],\n  "reasonsToSkip": ["<r1>", "<r2>"],\n  "proTips": ["<tip1>", "<tip2>"],\n  "valueRating": <number 0-10 with one decimal>,\n  "ratingExplanation": "<1-2 sentences>"\n}\n\n' +
    'Rules:\n- Be specific and grounded in the specs.\n- valueRating reflects price/performance honestly.\n\n' +
    `Context: approx price=${price}, key specs: ${ks || '-'}` + (prof ? `\nUser profile: ${prof}` : '')
  );
}
export function buildPredictionPrompt(p, lang) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  return (
    `You are an AI price forecaster. For "${name}" by ${brand || 'unknown'} (category: ${category}), predict the near-term price trend.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "trend": "<up|down|stable>",\n  "trendPercentage": <number 0-100, magnitude of expected change>,\n  "bestTimeToBuy": "<short phrase, e.g. a month/season>",\n  "expectedDrop": "<expected % range within 6 months>",\n  "buyOrWait": "<buy|wait>",\n  "reasoning": "<2-3 sentences>"\n}\n\n' +
    'Rules:\n- Base it on product age, category cycle, supply/demand and successor timing.\n\n' +
    `Context: approx current price=${price}, key specs: ${ks || '-'}`
  );
}

// Forum / community satisfaction — synthesises what people say across public
// forums (Reddit, XDA, dedicated communities, retailer reviews) into a single
// satisfaction percentage + praise / complaints. Mirrors the app's
// "Community Satisfaction" review analysis.
export function buildForumPrompt(p, lang) {
  const { name, brand, category, ks } = productLine(p, lang);
  return (
    `You are Qor AI analysing public community sentiment for "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Base it on widely-known discussions across public forums and communities (e.g. Reddit, XDA, dedicated enthusiast forums, large retailer review sections). ' +
    'Do NOT invent specific quotes or fake numbers — give a grounded synthesis.\n\n' +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)} (keep forum/site names as-is).\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "satisfaction": <number 0-100, overall % of owners who seem satisfied>,\n' +
    '  "summary": "<2-3 sentence synthesis of the community consensus>",\n' +
    '  "praise": ["<most common praise>", "<...>", "<...>"],\n' +
    '  "complaints": ["<most common complaint>", "<...>"],\n' +
    '  "sources": ["<forum/site 1>", "<forum/site 2>"],\n' +
    '  "verdict": "<1 sentence overall community verdict>"\n}\n\n' +
    'Rules:\n- satisfaction realistic (not always 90+).\n- 3-5 praise, 2-4 complaints.\n- Cite the kinds of communities where this product is discussed.\n\n' +
    `Context: key specs: ${ks || '-'}`
  );
}

// Compare prompt — structured JSON so the result renders as graphs (winner
// banner + per-product score bars + pros/cons) rather than a wall of text.
export function buildComparePrompt(products, lang, profile = {}) {
  const lines = (products || []).map((p) => {
    const { name, brand, category, score, ks } = productLine(p, lang);
    return `- ${name} (${brand || '?'} / ${category || '?'}; techScore=${score}; specs: ${ks || '-'})`;
  }).join('\n');
  const names = (products || []).map((p) => productLine(p, lang).name);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 12).join('; ');
  return (
    'You are Qor AI. Compare the products below and pick the best overall, considering the user profile.\n\n' +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)} (keep official product names as-is).\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "winner": "<exact product name of the best overall>",\n  "verdict": "<2-3 sentence summary of the head-to-head>",\n' +
    '  "products": [\n    {"name": "<exact product name>", "score": <0-100 overall fit>, "bestFor": "<who it fits>", "pros": ["<p1>", "<p2>"], "cons": ["<c1>", "<c2>"]}\n  ],\n' +
    '  "recommendation": "<2-3 sentence final recommendation for this user>"\n}\n\n' +
    'Rules:\n- One entry in "products" for EVERY product, names matching exactly.\n- Scores realistic and varied.\n- Ground every claim in the given specs.\n\n' +
    `Products:\n${lines}` + (prof ? `\n\nUser profile: ${prof}` : '') + `\n\nProduct names: ${names.join(' vs ')}`
  );
}

// ─── Parsing ────────────────────────────────────────────────────────────────
export function parseAiJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // strip ```json … ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // grab the outermost {...}
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { /* noop */ }
  // last-ditch: remove trailing commas
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}
const toInt = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : []);

// ─── Shared visual atoms ────────────────────────────────────────────────────
function scoreColor(n) { return n >= 80 ? '#22c55e' : n >= 60 ? '#f59e0b' : '#f43f5e'; }

function ScoreRing({ value, max = 100, suffix = '/ 100' }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = v / max;
  const col = scoreColor((v / max) * 100);
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div className="ai-ring">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity="0.14" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="ai-ring-t" style={{ color: col }}>
        <b>{Math.round(v)}</b><small>{suffix}</small>
      </div>
    </div>
  );
}

function AttrBar({ name, score, detail, color }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="ai-attr">
      <div className="ai-attr-top">
        <span className="ai-attr-name">{name}</span>
        <span className="ai-attr-score" style={{ color }}>{v}</span>
      </div>
      <div className="ai-attr-track" style={{ background: `${color}1f` }}>
        <i style={{ width: `${v}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
      {detail ? <small className="ai-attr-detail">{detail}</small> : null}
    </div>
  );
}

function ProCon({ icon, title, items, color }) {
  if (!items.length) return null;
  return (
    <div className="ai-procon" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <h5 style={{ color }}>{icon} {title}</h5>
      <ul>{items.map((x, i) => <li key={i}><span style={{ color }}>{icon === '✓' ? '✓' : '•'}</span>{x}</li>)}</ul>
    </div>
  );
}

function SectionLabel({ icon, label, color }) {
  return <div className="ai-seclabel" style={{ color }}>{icon} {label}</div>;
}

// ─── DEEP ANALYSIS ──────────────────────────────────────────────────────────
function DeepView({ data, L }) {
  const overall = toInt(data.overallScore);
  const strengths = arr(data.strengths).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const weaknesses = arr(data.weaknesses).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const pros = arr(data.pros).map(String);
  const cons = arr(data.cons).map(String);
  const verdict = String(data.verdict || '').trim();
  return (
    <div className="ai-deep">
      {overall > 0 && <div className="ai-center"><ScoreRing value={overall} /></div>}
      {strengths.length > 0 && (
        <>
          <SectionLabel icon="📈" label={L('Strengths', 'Güçlü Yönler', 'Stärken')} color="#22c55e" />
          {strengths.map((s, i) => <AttrBar key={i} {...s} color="#22c55e" />)}
        </>
      )}
      {weaknesses.length > 0 && (
        <>
          <SectionLabel icon="📉" label={L('Weaknesses', 'Zayıf Yönler', 'Schwächen')} color="#f43f5e" />
          {weaknesses.map((s, i) => <AttrBar key={i} {...s} color="#f43f5e" />)}
        </>
      )}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={pros} color="#22c55e" />
          <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={cons} color="#f43f5e" />
        </div>
      )}
      {verdict && <div className="ai-verdict"><span>💡</span><p>{verdict}</p></div>}
    </div>
  );
}

// ─── SMART ALTERNATIVES ─────────────────────────────────────────────────────
function AltView({ data, L }) {
  const alts = arr(data.alternatives);
  if (!alts.length) return null;
  return (
    <div className="ai-alts">
      {alts.map((a, i) => (
        <div className="ai-alt" key={i}>
          <div className="ai-alt-name">{a.name}</div>
          {a.whyBetter && <div className="ai-alt-why">★ {a.whyBetter}</div>}
          <div className="ai-alt-grid">
            {a.advantage && <div className="ai-alt-cell ai-alt-adv"><b>{L('Advantage', 'Avantaj', 'Vorteil')}</b><span>{a.advantage}</span></div>}
            {a.tradeoff && <div className="ai-alt-cell ai-alt-trade"><b>{L('Trade-off', 'Dezavantaj', 'Nachteil')}</b><span>{a.tradeoff}</span></div>}
            {a.priceComparison && <div className="ai-alt-cell"><b>{L('Price', 'Fiyat', 'Preis')}</b><span>{a.priceComparison}</span></div>}
            {a.bestFor && <div className="ai-alt-cell"><b>{L('Best for', 'Kime uygun', 'Ideal für')}</b><span>{a.bestFor}</span></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ADVISOR ────────────────────────────────────────────────────────────────
function AdvisorView({ data, L }) {
  const rating = toNum(data.valueRating);
  const buy = arr(data.reasonsToBuy).map(String);
  const skip = arr(data.reasonsToSkip).map(String);
  const tips = arr(data.proTips).map(String);
  return (
    <div className="ai-advisor">
      {rating > 0 && (
        <div className="ai-center"><ScoreRing value={rating} max={10} suffix="/ 10" /></div>
      )}
      {String(data.ratingExplanation || '').trim() && <p className="ai-advisor-exp">{data.ratingExplanation}</p>}
      {String(data.whoShouldBuy || '').trim() && (
        <div className="ai-advisor-box ai-good"><b>👍 {L('Who should buy', 'Kime uygun', 'Für wen geeignet')}</b><p>{data.whoShouldBuy}</p></div>
      )}
      {String(data.whoShouldAvoid || '').trim() && (
        <div className="ai-advisor-box ai-bad"><b>👎 {L('Who should avoid', 'Kime uygun değil', 'Für wen ungeeignet')}</b><p>{data.whoShouldAvoid}</p></div>
      )}
      {(buy.length > 0 || skip.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Reasons to buy', 'Alma sebepleri', 'Gründe dafür')} items={buy} color="#22c55e" />
          <ProCon icon="✕" title={L('Reasons to skip', 'Almama sebepleri', 'Gründe dagegen')} items={skip} color="#f43f5e" />
        </div>
      )}
      {tips.length > 0 && (
        <div className="ai-tips"><b>💡 {L('Pro tips', 'İpuçları', 'Profi-Tipps')}</b><ul>{tips.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}
    </div>
  );
}

// ─── PRICE PREDICTION ───────────────────────────────────────────────────────
function PredictionView({ data, L }) {
  const trend = String(data.trend || 'stable').toLowerCase();
  const pct = toInt(data.trendPercentage);
  const buyWait = String(data.buyOrWait || 'buy').toLowerCase();
  const arrow = trend === 'down' ? '↓' : trend === 'up' ? '↑' : '→';
  const tColor = trend === 'down' ? '#22c55e' : trend === 'up' ? '#f43f5e' : '#f59e0b';
  return (
    <div className="ai-pred">
      <div className="ai-pred-head">
        <div className="ai-pred-trend" style={{ color: tColor }}>
          <span className="ai-pred-arrow">{arrow}</span>
          <div><b>{trend === 'down' ? L('Falling', 'Düşüyor', 'Fällt') : trend === 'up' ? L('Rising', 'Yükseliyor', 'Steigt') : L('Stable', 'Sabit', 'Stabil')}</b>{pct > 0 && <small>~{pct}%</small>}</div>
        </div>
        <div className={'ai-pred-verdict ' + (buyWait === 'wait' ? 'wait' : 'buy')}>
          {buyWait === 'wait' ? `⏳ ${L('Wait', 'Bekle', 'Warten')}` : `✓ ${L('Buy now', 'Şimdi al', 'Jetzt kaufen')}`}
        </div>
      </div>
      <div className="ai-pred-grid">
        {String(data.bestTimeToBuy || '').trim() && <div className="ai-pred-cell"><b>{L('Best time', 'En iyi zaman', 'Beste Zeit')}</b><span>{data.bestTimeToBuy}</span></div>}
        {String(data.expectedDrop || '').trim() && <div className="ai-pred-cell"><b>{L('Expected drop', 'Beklenen indirim', 'Erwarteter Rückgang')}</b><span>{data.expectedDrop}</span></div>}
      </div>
      {String(data.reasoning || '').trim() && <p className="ai-pred-reason">{data.reasoning}</p>}
    </div>
  );
}

// ─── COMPARE ────────────────────────────────────────────────────────────────
function CompareView({ data, L }) {
  const winner = String(data.winner || '').trim();
  const products = arr(data.products).map((p) => ({
    name: p.name || '', score: toInt(p.score), bestFor: p.bestFor || '',
    pros: arr(p.pros).map(String), cons: arr(p.cons).map(String),
  }));
  if (!products.length) return null;
  const max = Math.max(1, ...products.map((p) => p.score));
  return (
    <div className="ai-cmp">
      {winner && (
        <div className="ai-cmp-winner"><span>🏆</span><div><small>{L('AI pick', 'AI seçimi', 'KI-Wahl')}</small><b>{winner}</b></div></div>
      )}
      {String(data.verdict || '').trim() && <p className="ai-cmp-verdict">{data.verdict}</p>}
      <div className="ai-cmp-products">
        {products.map((p, i) => {
          const isWin = winner && p.name.toLowerCase() === winner.toLowerCase();
          const col = isWin ? '#22c55e' : '#3b82f6';
          return (
            <div className={'ai-cmp-prod' + (isWin ? ' win' : '')} key={i}>
              <div className="ai-cmp-prod-top">
                <span className="ai-cmp-prod-name">{isWin ? '★ ' : ''}{p.name}</span>
                <span className="ai-cmp-prod-score" style={{ color: col }}>{p.score}</span>
              </div>
              <div className="ai-attr-track" style={{ background: `${col}1f` }}>
                <i style={{ width: `${(p.score / max) * 100}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
              </div>
              {p.bestFor && <div className="ai-cmp-bestfor">{L('Best for', 'Kime uygun', 'Ideal für')}: <b>{p.bestFor}</b></div>}
              {(p.pros.length > 0 || p.cons.length > 0) && (
                <div className="ai-procon-row">
                  <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={p.pros} color="#22c55e" />
                  <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={p.cons} color="#f43f5e" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {String(data.recommendation || '').trim() && (
        <div className="ai-verdict"><span>💡</span><p>{data.recommendation}</p></div>
      )}
    </div>
  );
}

// ─── FORUM / COMMUNITY SATISFACTION ─────────────────────────────────────────
function ForumView({ data, L }) {
  const sat = toInt(data.satisfaction);
  const praise = arr(data.praise).map(String);
  const complaints = arr(data.complaints).map(String);
  const sources = arr(data.sources).map(String);
  return (
    <div className="ai-forum">
      {sat > 0 && (
        <div className="ai-forum-gauge">
          <ScoreRing value={sat} suffix="%" />
          <div className="ai-forum-gauge-t">
            <b>{L('Community satisfaction', 'Topluluk memnuniyeti', 'Community-Zufriedenheit')}</b>
            <small>{L('Synthesised from public forums & reviews', 'Açık forum ve yorumlardan derlendi', 'Aus öffentlichen Foren & Reviews')}</small>
          </div>
        </div>
      )}
      {String(data.summary || '').trim() && <p className="ai-forum-summary">{data.summary}</p>}
      {(praise.length > 0 || complaints.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('People love', 'Beğenilenler', 'Beliebt')} items={praise} color="#22c55e" />
          <ProCon icon="✕" title={L('Common complaints', 'Şikayetler', 'Häufige Kritik')} items={complaints} color="#f43f5e" />
        </div>
      )}
      {sources.length > 0 && (
        <div className="ai-forum-sources">
          <small>{L('Sources', 'Kaynaklar', 'Quellen')}:</small>
          {sources.map((s, i) => <span key={i} className="ai-forum-src">{s}</span>)}
        </div>
      )}
      {String(data.verdict || '').trim() && <div className="ai-verdict"><span>👥</span><p>{data.verdict}</p></div>}
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
// kind: 'deep' | 'alts' | 'advisor' | 'pred'. Returns null when JSON is unusable
// so the caller can fall back to plain text.
export default function AiAnalysisView({ kind, raw, lang }) {
  const data = parseAiJson(raw);
  if (!data || typeof data !== 'object') return null;
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (en, tr, de) => (code === 'tr' ? tr : code === 'de' ? de : en);
  if (kind === 'deep') return <DeepView data={data} L={L} />;
  if (kind === 'alts') return <AltView data={data} L={L} />;
  if (kind === 'advisor') return <AdvisorView data={data} L={L} />;
  if (kind === 'pred') return <PredictionView data={data} L={L} />;
  if (kind === 'compare') return <CompareView data={data} L={L} />;
  if (kind === 'forum') return <ForumView data={data} L={L} />;
  return null;
}
