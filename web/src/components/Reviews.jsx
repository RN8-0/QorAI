import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n/index.jsx';
import {
  getReviews, createReview, deleteReview, averageRating,
  toggleReviewLike, toggleReviewDislike,
  getReplies, addReply, deleteReply, toggleReplyLike, toggleReplyDislike,
} from '../lib/reviews';

function Stars({ value }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? 'on' : ''}>★</span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }) {
  return (
    <span className="stars stars-pick">
      {[1, 2, 3, 4, 5].map((i) => (
        <button type="button" key={i} className={i <= value ? 'on' : ''}
          onClick={() => onChange(i)} aria-label={`${i}`}>★</button>
      ))}
    </span>
  );
}

// Like / dislike control shared by reviews and replies.
function VoteBar({ likes, dislikes, mine, onLike, onDislike, t }) {
  return (
    <span className="rv-votes">
      <button className={'rv-vote' + (mine === 'like' ? ' on' : '')}
        onClick={onLike} aria-label={t('rv.like')}>
        👍 {likes > 0 && <b>{likes}</b>}
      </button>
      <button className={'rv-vote' + (mine === 'dislike' ? ' on' : '')}
        onClick={onDislike} aria-label={t('rv.dislike')}>
        👎 {dislikes > 0 && <b>{dislikes}</b>}
      </button>
    </span>
  );
}

function Replies({ reviewId }) {
  const t = useT();
  const { user, openAuth } = useAuth();
  const [replies, setReplies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReplies(reviewId).then((r) => { setReplies(r); setLoaded(true); });
  }, [reviewId]);

  async function submit(e) {
    e.preventDefault();
    if (!user) { openAuth(); return; }
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addReply(reviewId, text);
      setText('');
      setReplies(await getReplies(reviewId));
    } catch { /* noop */ }
    finally { setBusy(false); }
  }

  async function vote(reply, kind) {
    if (!user) { openAuth(); return; }
    const fn = kind === 'like' ? toggleReplyLike : toggleReplyDislike;
    try {
      const next = await fn(reply.id);
      setReplies((list) => list.map((x) => (x.id === reply.id ? { ...x, ...next } : x)));
    } catch { /* noop */ }
  }

  async function remove(id) {
    setReplies((list) => list.filter((x) => x.id !== id));
    try { await deleteReply(id); } catch { /* noop */ }
  }

  return (
    <div className="rv-replies">
      {loaded && replies.map((r) => {
        const mine = user && r.likedBy.includes(user.id) ? 'like'
          : user && r.dislikedBy.includes(user.id) ? 'dislike' : '';
        return (
          <div className="rv-reply" key={r.id}>
            <div className="rv-reply-head">
              <strong>{r.author || t('nav.profile')}</strong>
              <span className="rv-date">{r.created ? new Date(r.created).toLocaleDateString() : ''}</span>
              {user && r.userId === user.id && (
                <button className="rv-del" onClick={() => remove(r.id)}
                  aria-label={t('rv.delete')} title={t('rv.delete')}>🗑</button>
              )}
            </div>
            {r.text && <p className="rv-reply-text">{r.text}</p>}
            <VoteBar likes={r.likedBy.length} dislikes={r.dislikedBy.length} mine={mine}
              onLike={() => vote(r, 'like')} onDislike={() => vote(r, 'dislike')} t={t} />
          </div>
        );
      })}
      {user ? (
        <form className="rv-reply-form" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('rv.replyPlaceholder')} maxLength={500} />
          <button type="submit" className="btn btn-ghost" disabled={busy || !text.trim()}>
            {t('rv.reply')}
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost rv-reply-login" onClick={openAuth}>
          {t('pd.revSignIn')}
        </button>
      )}
    </div>
  );
}

// Rating distribution sidebar (1★..5★ bars). The mobile app shows the same
// breakdown beside the average — without it the website looks sparse next to
// the app for products with many reviews.
function RatingBreakdown({ reviews }) {
  const buckets = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    const n = Math.round(Number(r.rating) || 0);
    if (n >= 1 && n <= 5) buckets[n - 1] += 1;
  }
  const max = Math.max(1, ...buckets);
  return (
    <div className="pd-rev-dist">
      {[5, 4, 3, 2, 1].map((s) => {
        const count = buckets[s - 1];
        const pct = Math.round((count / max) * 100);
        return (
          <div className="pd-rev-dist-row" key={s}>
            <span className="pd-rev-dist-lbl">{s}★</span>
            <span className="pd-rev-dist-bar"><i style={{ width: `${pct}%` }} /></span>
            <span className="pd-rev-dist-n">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// Opens a YouTube search for "<product> detailed review" in the user's
// language. Apps shows actual embedded thumbnails — we can't scrape YouTube
// from the browser (CORS), so we link out instead. Mirrors the app's intent:
// give the user a one-tap shortcut to video reviews.
function YouTubeSearchCard({ productName, lang }) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const keyword = {
    tr: 'detaylı inceleme', de: 'ausführlicher Test', fr: 'test complet avis',
    es: 'análisis completo review', it: 'recensione completa', pt: 'análise completa',
    ru: 'подробный обзор', ar: 'مراجعة شاملة', ja: 'レビュー 詳細',
    ko: '리뷰 상세', zh: '详细评测',
  }[code] || 'detailed review';
  const query = encodeURIComponent(`${productName} ${keyword}`);
  const url = `https://www.youtube.com/results?search_query=${query}`;
  const L = (en, tr, de) => (code === 'tr' ? tr : code === 'de' ? de : en);
  return (
    <a className="pd-yt-card" href={url} target="_blank" rel="noopener">
      <span className="pd-yt-ic" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#ff0033">
          <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z" />
        </svg>
      </span>
      <span className="pd-yt-t">
        <b>{L('Watch YouTube reviews', 'YouTube incelemelerini izle', 'YouTube-Reviews ansehen')}</b>
        <small>{L('Curated video reviews from creators', 'YouTube\'da detaylı inceleme videolarını aç', 'Kuratierte Video-Reviews öffnen')}</small>
      </span>
      <span className="pd-yt-arr" aria-hidden="true">↗</span>
    </a>
  );
}

export default function Reviews({ productId, productName, lang }) {
  const t = useT();
  const { user, openAuth } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [openReplies, setOpenReplies] = useState(null);
  const [sortMode, setSortMode] = useState('new');

  useEffect(() => {
    setReviews([]); setRating(0); setText(''); setMsg(''); setOpenReplies(null);
    getReviews(productId).then(setReviews);
  }, [productId]);

  async function submit(e) {
    e.preventDefault();
    if (!user) { openAuth(); return; }
    if (!rating || !text.trim()) return;
    setBusy(true); setMsg('');
    try {
      await createReview(productId, rating, text);
      setText(''); setRating(0); setMsg('ok');
      setReviews(await getReviews(productId));
    } catch {
      setMsg('err');
    } finally {
      setBusy(false);
    }
  }

  async function vote(review, kind) {
    if (!user) { openAuth(); return; }
    const fn = kind === 'like' ? toggleReviewLike : toggleReviewDislike;
    try {
      const next = await fn(review.id);
      setReviews((list) => list.map((x) => (x.id === review.id ? { ...x, ...next } : x)));
    } catch { /* noop */ }
  }

  async function remove(id) {
    setReviews((list) => list.filter((r) => r.id !== id));
    try { await deleteReview(id); } catch { /* noop */ }
  }

  const avg = averageRating(reviews);
  const sortedReviews = (() => {
    const list = [...reviews];
    if (sortMode === 'top') {
      list.sort((a, b) => (b.likedBy.length - b.dislikedBy.length) - (a.likedBy.length - a.dislikedBy.length));
    } else if (sortMode === 'high') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortMode === 'low') {
      list.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }
    return list;
  })();

  return (
    <section className="pd-section">
      {productName && <YouTubeSearchCard productName={productName} lang={lang} />}
      <div className="pd-section-head">
        <h2>{t('pd.reviews')}</h2>
        {reviews.length > 0 && (
          <span className="pd-rev-avg">
            <Stars value={Math.round(avg)} />
            {t('pd.revAvg', { n: reviews.length, avg: avg.toFixed(1) })}
          </span>
        )}
      </div>
      {reviews.length > 0 && (
        <div className="pd-rev-summary">
          <div className="pd-rev-summary-score">
            <b>{avg.toFixed(1)}</b>
            <Stars value={Math.round(avg)} />
            <small>{reviews.length} {reviews.length === 1 ? '★' : '★★'}</small>
          </div>
          <RatingBreakdown reviews={reviews} />
        </div>
      )}

      <form className="pd-rev-form" onSubmit={submit}>
        {user ? (
          <>
            <div className="pd-rev-form-top">
              <span className="pd-rev-label">{t('pd.revYour')}</span>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t('pd.revPlaceholder')} rows={3} maxLength={1000} />
            {msg === 'ok' && <div className="pd-rev-ok">{t('pd.revThanks')}</div>}
            {msg === 'err' && <div className="pd-rev-er">{t('pd.revErr')}</div>}
          </>
        ) : (
          <div className="pd-rev-login">
            <span>{t('pd.revSignIn')}</span>
          </div>
        )}
        {user ? (
          <button type="submit" className="btn btn-primary"
            disabled={busy || !rating || !text.trim()}>
            {t('pd.revSubmit')}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={openAuth}>
            {t('pd.revSignIn')}
          </button>
        )}
      </form>

      {reviews.length === 0 ? (
        <div className="pd-note">{t('pd.revNone')}</div>
      ) : (
        <>
          <div className="pd-rev-sort">
            <button className={sortMode === 'new' ? 'on' : ''} onClick={() => setSortMode('new')}>{t('pd.revSortNew') || 'Yeni'}</button>
            <button className={sortMode === 'top' ? 'on' : ''} onClick={() => setSortMode('top')}>{t('pd.revSortTop') || 'En Beğenilen'}</button>
            <button className={sortMode === 'high' ? 'on' : ''} onClick={() => setSortMode('high')}>{t('pd.revSortHigh') || 'En Yüksek'}</button>
            <button className={sortMode === 'low' ? 'on' : ''} onClick={() => setSortMode('low')}>{t('pd.revSortLow') || 'En Düşük'}</button>
          </div>
          <div className="pd-rev-list">
          {sortedReviews.map((r) => {
            const mine = user && r.likedBy.includes(user.id) ? 'like'
              : user && r.dislikedBy.includes(user.id) ? 'dislike' : '';
            return (
              <div className="pd-rev-item" key={r.id}>
                <div className="pd-rev-item-head">
                  <div className="pd-rev-av">{(r.author || 'U')[0].toUpperCase()}</div>
                  <div className="pd-rev-meta">
                    <strong>{r.author || t('nav.profile')}</strong>
                    <Stars value={r.rating} />
                  </div>
                  <span className="pd-rev-date">
                    {r.created ? new Date(r.created).toLocaleDateString() : ''}
                  </span>
                  {user && r.userId === user.id && (
                    <button className="rv-del" onClick={() => remove(r.id)}
                      aria-label={t('rv.delete')} title={t('rv.delete')}>🗑</button>
                  )}
                </div>
                {r.text && <p className="pd-rev-text">{r.text}</p>}
                <div className="rv-actions">
                  <VoteBar likes={r.likedBy.length} dislikes={r.dislikedBy.length} mine={mine}
                    onLike={() => vote(r, 'like')} onDislike={() => vote(r, 'dislike')} t={t} />
                  <button className="rv-reply-toggle"
                    onClick={() => setOpenReplies(openReplies === r.id ? null : r.id)}>
                    💬 {openReplies === r.id ? t('rv.hideReplies') : t('rv.showReplies')}
                  </button>
                </div>
                {openReplies === r.id && <Replies reviewId={r.id} />}
              </div>
            );
          })}
          </div>
        </>
      )}
    </section>
  );
}
