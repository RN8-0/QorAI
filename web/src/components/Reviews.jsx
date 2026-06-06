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

export default function Reviews({ productId }) {
  const t = useT();
  const { user, openAuth } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [openReplies, setOpenReplies] = useState(null);

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

  return (
    <section className="pd-section">
      <div className="pd-section-head">
        <h2>{t('pd.reviews')}</h2>
        {reviews.length > 0 && (
          <span className="pd-rev-avg">
            <Stars value={Math.round(avg)} />
            {t('pd.revAvg', { n: reviews.length, avg: avg.toFixed(1) })}
          </span>
        )}
      </div>

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
        <div className="pd-rev-list">
          {reviews.map((r) => {
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
      )}
    </section>
  );
}
