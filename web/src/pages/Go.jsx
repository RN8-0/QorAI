import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { pb } from '../lib/pocketbase';
import { isFreshPricedOffer, normalizeOffer } from '../lib/offers';
import { amazonTagUrl, safeExternalUrl, amazonUrlFromParams } from '../lib/format';
import { detectCountry, useGeoCountry } from '../lib/geo';
import { productPath } from '../lib/routes';
import { useSeo } from '../lib/seo';
import './Placeholder.css';

export default function Go() {
  const [params] = useSearchParams();
  const { lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const offerId = params.get('offer') || '';
  const productId = params.get('product') || '';
  // Direct Amazon search redirect (no offer record): /go?store=amazon&m=DE&q=...
  // The URL itself is built INSIDE the effect, after the visitor's geo is
  // known: Amazon's server-side gg3 router bounces any TAGGED amazon.* URL to
  // the visitor's nearest storefront (TR IP → amazon.it), so the tag may only
  // be kept when the geo matches the chosen storefront (amazonTagAllowed).
  const amazonMarket = params.get('store') === 'amazon' ? (params.get('m') || '') : '';
  const amazonQuery = params.get('store') === 'amazon' ? (params.get('q') || '') : '';
  const geoCountry = useGeoCountry();
  const [state, setState] = useState({ status: 'loading', offer: null, message: '' });

  useSeo({
    title: 'Store redirect — Qor AI',
    description: 'Qor AI store redirect.',
    noindex: true,
    path: '/go',
  });

  useEffect(() => {
    let live = true;
    // Amazon direct redirect short-circuits the offer lookup entirely. Geo is
    // awaited (localStorage-cached, instant on repeat visits) BEFORE the URL
    // exists, so the tag decision never races the redirect.
    if (amazonMarket && amazonQuery) {
      let timer = 0;
      setState({ status: 'redirecting', offer: null, message: '' });
      detectCountry().then((cc) => {
        if (!live) return;
        const target = amazonUrlFromParams(amazonMarket, amazonQuery, cc);
        if (!target) {
          setState({ status: 'error', offer: null, message: L('Store link is unavailable.', 'Mağaza bağlantısı kullanılamıyor.') });
          return;
        }
        timer = window.setTimeout(() => { window.location.assign(target); }, 300);
      });
      return () => { live = false; window.clearTimeout(timer); };
    }
    async function run() {
      if (!offerId) {
        setState({ status: 'error', offer: null, message: L('Missing offer.', 'Teklif bulunamadı.') });
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
        // Stored offers keep their OWN storefront (it is the ship-to country
        // their row was rendered under — strict country rule). Only the tag is
        // decided, from the visitor's geo, never the domain: the old
        // localizeAmazonUrl(lang) here rewrote even a TR offer to amazon.de.
        const cc = await detectCountry();
        const target = offer.network === 'amazon'
          ? amazonTagUrl(offer.url, cc)
          : safeExternalUrl(offer.url);
        if (!target) {
          setState({ status: 'error', offer, message: L('Store link is unavailable.', 'Mağaza bağlantısı kullanılamıyor.') });
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
        setState({ status: 'error', offer: null, message: L('Offer could not be loaded.', 'Teklif yüklenemedi.') });
      }
    }
    const cleanupPromise = run();
    return () => {
      live = false;
      if (cleanupPromise && typeof cleanupPromise.then === 'function') cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [offerId, amazonMarket, amazonQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => (
    state.offer?.network === 'amazon'
      ? amazonTagUrl(state.offer?.url || '', geoCountry)
      : safeExternalUrl(state.offer?.url || '')
  ), [state.offer, geoCountry]);
  const back = productId || state.offer?.productId ? productPath(productId || state.offer.productId) : '/';

  if (state.status === 'redirecting') {
    return (
      <div className="container ph">
        <div className="ph-card fade-up">
          <div className="ph-emoji">↗</div>
          <h1>{L('Opening store', 'Mağaza açılıyor')}</h1>
          <p>{L(
            'We are sending you to the merchant. Store links may be affiliate links; Qor AI scores are never affected.',
            'Seni mağazaya yönlendiriyoruz. Mağaza linkleri affiliate olabilir; Qor AI puanları bundan etkilenmez.',
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
          <h1>{L('Preparing store link', 'Mağaza bağlantısı hazırlanıyor')}</h1>
          <p>{L('Checking the latest offer information.', 'En güncel teklif bilgisi kontrol ediliyor.')}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'stale') {
    return (
      <div className="container ph">
        <div className="ph-card fade-up">
          <div className="ph-emoji">⏱</div>
          <h1>{L('Check current price', 'Güncel fiyatı kontrol et')}</h1>
          <p>{L(
            'This price is no longer fresh enough to show as exact. Open the store to see the current price before buying.',
            'Bu fiyatı kesin fiyat olarak gösterecek kadar güncel değil. Satın almadan önce mağazada güncel fiyatı kontrol et.',
          )}</p>
          <div className="ph-actions">
            {target && <a className="btn btn-primary" href={target} rel="sponsored noopener">{L('Open store', 'Mağazayı aç')}</a>}
            <Link to={back} className="btn btn-ghost">{L('Back to product', 'Ürüne dön')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">🔎</div>
        <h1>{L('Offer unavailable', 'Teklif kullanılamıyor')}</h1>
        <p>{state.message || L('We could not open this store link.', 'Bu mağaza bağlantısını açamadık.')}</p>
        <div className="ph-actions">
          <Link to={back} className="btn btn-primary">{L('Back', 'Geri dön')}</Link>
        </div>
      </div>
    </div>
  );
}
