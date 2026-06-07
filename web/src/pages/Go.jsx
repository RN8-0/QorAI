import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { pb } from '../lib/pocketbase';
import { isFreshPricedOffer, normalizeOffer } from '../lib/offers';
import { localizeAmazonUrl, safeExternalUrl } from '../lib/format';
import { productPath } from '../lib/routes';
import { useSeo } from '../lib/seo';
import './Placeholder.css';

export default function Go() {
  const [params] = useSearchParams();
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const offerId = params.get('offer') || '';
  const productId = params.get('product') || '';
  const [state, setState] = useState({ status: 'loading', offer: null, message: '' });

  useSeo({
    title: 'Store redirect — Qor AI',
    description: 'Qor AI store redirect.',
    noindex: true,
    path: '/go',
  });

  useEffect(() => {
    let live = true;
    async function run() {
      if (!offerId) {
        setState({ status: 'error', offer: null, message: L('Missing offer.', 'Teklif bulunamadı.', 'Angebot fehlt.') });
        return;
      }
      try {
        const rec = await pb.collection('offers').getOne(offerId, {
          fields: [
            'id', 'productId', 'store', 'network', 'country',
            'price', 'shipping', 'totalPrice', 'currency', 'priceText',
            'url', 'affiliateUrl', 'condition', 'availability', 'inStock',
            'priceUnknown', 'matchConfidence', 'lastCheckedAt',
            'priceUpdatedAt', 'expiresAt', 'scrapedAt', 'updated', 'source',
          ].join(','),
        });
        if (!live) return;
        const offer = normalizeOffer(rec);
        const target = offer.network === 'amazon'
          ? localizeAmazonUrl(offer.url, lang)
          : safeExternalUrl(offer.url);
        if (!target) {
          setState({ status: 'error', offer, message: L('Store link is unavailable.', 'Mağaza bağlantısı kullanılamıyor.', 'Shop-Link ist nicht verfügbar.') });
          return;
        }
        const fresh = offer.hasExactPrice || offer.priceUnknown || isFreshPricedOffer(offer);
        if (!fresh) {
          setState({ status: 'stale', offer, message: '' });
          return;
        }
        setState({ status: 'redirecting', offer, message: '' });
        const timer = window.setTimeout(() => {
          window.location.assign(target);
        }, 450);
        return () => window.clearTimeout(timer);
      } catch (err) {
        if (!live) return;
        setState({ status: 'error', offer: null, message: L('Offer could not be loaded.', 'Teklif yüklenemedi.', 'Angebot konnte nicht geladen werden.') });
      }
    }
    const cleanupPromise = run();
    return () => {
      live = false;
      if (cleanupPromise && typeof cleanupPromise.then === 'function') cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [offerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => (
    state.offer?.network === 'amazon'
      ? localizeAmazonUrl(state.offer?.url || '', lang)
      : safeExternalUrl(state.offer?.url || '')
  ), [state.offer, lang]);
  const back = productId || state.offer?.productId ? productPath(productId || state.offer.productId) : '/';

  if (state.status === 'redirecting') {
    return (
      <div className="container ph">
        <div className="ph-card fade-up">
          <div className="ph-emoji">↗</div>
          <h1>{L('Opening store', 'Mağaza açılıyor', 'Shop wird geöffnet')}</h1>
          <p>{L(
            'We are sending you to the merchant. Store links may be affiliate links; Qor AI scores are never affected.',
            'Seni mağazaya yönlendiriyoruz. Mağaza linkleri affiliate olabilir; Qor AI puanları bundan etkilenmez.',
            'Wir leiten dich zum Shop weiter. Shop-Links können Affiliate-Links sein; Qor AI Bewertungen bleiben unabhängig.',
          )}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="container ph">
        <div className="ph-card fade-up">
          <div className="ph-emoji">↗</div>
          <h1>{L('Preparing store link', 'Mağaza bağlantısı hazırlanıyor', 'Shop-Link wird vorbereitet')}</h1>
          <p>{L('Checking the latest offer information.', 'En güncel teklif bilgisi kontrol ediliyor.', 'Die neuesten Angebotsdaten werden geprüft.')}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'stale') {
    return (
      <div className="container ph">
        <div className="ph-card fade-up">
          <div className="ph-emoji">⏱</div>
          <h1>{L('Check current price', 'Güncel fiyatı kontrol et', 'Aktuellen Preis prüfen')}</h1>
          <p>{L(
            'This price is no longer fresh enough to show as exact. Open the store to see the current price before buying.',
            'Bu fiyatı kesin fiyat olarak gösterecek kadar güncel değil. Satın almadan önce mağazada güncel fiyatı kontrol et.',
            'Dieser Preis ist nicht mehr frisch genug für eine genaue Anzeige. Prüfe vor dem Kauf den aktuellen Shop-Preis.',
          )}</p>
          <div className="ph-actions">
            {target && <a className="btn btn-primary" href={target} rel="sponsored noopener">{L('Open store', 'Mağazayı aç', 'Shop öffnen')}</a>}
            <Link to={back} className="btn btn-ghost">{L('Back to product', 'Ürüne dön', 'Zurück zum Produkt')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">🔎</div>
        <h1>{L('Offer unavailable', 'Teklif kullanılamıyor', 'Angebot nicht verfügbar')}</h1>
        <p>{state.message || L('We could not open this store link.', 'Bu mağaza bağlantısını açamadık.', 'Wir konnten diesen Shop-Link nicht öffnen.')}</p>
        <div className="ph-actions">
          <Link to={back} className="btn btn-primary">{L('Back', 'Geri dön', 'Zurück')}</Link>
        </div>
      </div>
    </div>
  );
}
