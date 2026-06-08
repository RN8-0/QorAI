import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import {
  getComparisonReviews, createComparisonReview, deleteComparisonReview,
  toggleComparisonLike, toggleComparisonDislike, averageRating,
} from '../lib/comparisonReviews';

function Stars({ value }) {
  return <span className="stars">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= value ? 'on' : ''}>★</span>)}</span>;
}
function StarPicker({ value, onChange }) {
  return (
    <span className="stars stars-pick">
      {[1, 2, 3, 4, 5].map((i) => (
        <button type="button" key={i} className={i <= value ? 'on' : ''} onClick={() => onChange(i)} aria-label={`${i}`}>★</button>
      ))}
    </span>
  );
}

// Unified review thread for a whole comparison (one set of products), backed by
// the same `comparison_reviews` collection the app uses. Lives at the bottom of
// the compare page, independent of the Specs / AI tabs.
export default function CompareReviews({ productIds, productNames }) {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const { user, openAuth } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const key = [...(productIds || [])].sort().join('_');

  useEffect(() => {
    setReviews([]); setRating(0); setText(''); setMsg('');
    if (productIds && productIds.length >= 2) getComparisonReviews(productIds).then(setReviews);
  }, [key]); // eslint-disable-line

  async function submit(e) {
    e.preventDefault();
    if (!user) { openAuth(); return; }
    if (!rating || !text.trim()) return;
    setBusy(true); setMsg('');
    try {
      await createComparisonReview(productIds, rating, text);
      setText(''); setRating(0); setMsg('ok');
      setReviews(await getComparisonReviews(productIds));
    } catch { setMsg('err'); } finally { setBusy(false); }
  }
  async function vote(r, kind) {
    if (!user) { openAuth(); return; }
    try {
      const next = await (kind === 'like' ? toggleComparisonLike : toggleComparisonDislike)(r.id);
      setReviews((list) => list.map((x) => (x.id === r.id ? { ...x, ...next } : x)));
    } catch { /* noop */ }
  }
  async function remove(id) {
    setReviews((list) => list.filter((r) => r.id !== id));
    try { await deleteComparisonReview(id); } catch { /* noop */ }
  }

  if (!productIds || productIds.length < 2) return null;
  const avg = averageRating(reviews);

  return (
    <section className="cmp-reviews">
      <div className="cmp-reviews-head">
        <h2>💬 {L('Comparison reviews', 'Karşılaştırma yorumları', 'Vergleichsbewertungen')}</h2>
        <span className="cmp-reviews-sub">{productNames || ''}</span>
        {reviews.length > 0 && (
          <span className="pd-rev-avg"><Stars value={Math.round(avg)} /> {avg.toFixed(1)} · {reviews.length}</span>
        )}
      </div>
      <p className="cmp-reviews-note">
        {L('Reviews are shared for this exact comparison — across web and the app.',
           'Yorumlar tam olarak bu karşılaştırma için ortak — web ve uygulamada görünür.',
           'Bewertungen gelten für genau diesen Vergleich — web- und app-übergreifend.')}
      </p>

      <form className="pd-rev-form" onSubmit={submit}>
        {user ? (
          <>
            <div className="pd-rev-form-top">
              <span className="pd-rev-label">{L('Your rating', 'Puanın', 'Deine Bewertung')}</span>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
              placeholder={L('Share which one you would pick and why…', 'Hangisini seçerdin ve neden, paylaş…', 'Teile, welches du wählen würdest und warum…')} />
            {msg === 'ok' && <div className="pd-rev-ok">{L('Thanks for your review!', 'Yorumun için teşekkürler!', 'Danke für deine Bewertung!')}</div>}
            {msg === 'err' && <div className="pd-rev-er">{L('Could not submit. Try again.', 'Gönderilemedi. Tekrar dene.', 'Konnte nicht gesendet werden.')}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !rating || !text.trim()}>
              {L('Submit review', 'Yorumu gönder', 'Bewertung senden')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={openAuth}>
            {L('Sign in to review this comparison', 'Bu karşılaştırmayı yorumlamak için giriş yap', 'Anmelden zum Bewerten')}
          </button>
        )}
      </form>

      {reviews.length === 0 ? (
        <div className="pd-note">{L('No reviews yet — be the first to review this comparison.', 'Henüz yorum yok — bu karşılaştırmayı ilk değerlendiren sen ol.', 'Noch keine Bewertungen — sei der Erste.')}</div>
      ) : (
        <div className="pd-rev-list">
          {reviews.map((r) => {
            const mine = user && r.likedBy.includes(user.id) ? 'like' : user && r.dislikedBy.includes(user.id) ? 'dislike' : '';
            return (
              <div className="pd-rev-item" key={r.id}>
                <div className="pd-rev-item-head">
                  <div className="pd-rev-av">{(r.author || 'U')[0].toUpperCase()}</div>
                  <div className="pd-rev-meta">
                    <strong>{r.author || 'User'}</strong>
                    <Stars value={r.rating} />
                  </div>
                  <span className="pd-rev-date">{r.created ? new Date(r.created).toLocaleDateString() : ''}</span>
                  {user && r.userId === user.id && (
                    <button className="rv-del" onClick={() => remove(r.id)} title={L('Delete', 'Sil', 'Löschen')}>🗑</button>
                  )}
                </div>
                {r.text && <p className="pd-rev-text">{r.text}</p>}
                <div className="rv-actions">
                  <span className="rv-votes">
                    <button className={'rv-vote' + (mine === 'like' ? ' on' : '')} onClick={() => vote(r, 'like')}>👍 {r.likedBy.length > 0 && <b>{r.likedBy.length}</b>}</button>
                    <button className={'rv-vote' + (mine === 'dislike' ? ' on' : '')} onClick={() => vote(r, 'dislike')}>👎 {r.dislikedBy.length > 0 && <b>{r.dislikedBy.length}</b>}</button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
