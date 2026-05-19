// Google AdSense configuration.
// The publisher (client) ID is also referenced in website/index.html.
// Individual ad-unit slot IDs come from the AdSense dashboard and are
// supplied per placement via VITE_ADSENSE_SLOT_* env vars — when unset,
// AdSlot renders nothing and Auto Ads still cover monetisation.
export const ADSENSE_CLIENT = 'ca-pub-1522897791319993';

export const AD_SLOTS = {
  home: import.meta.env.VITE_ADSENSE_SLOT_HOME || '',
  category: import.meta.env.VITE_ADSENSE_SLOT_CATEGORY || '',
  product: import.meta.env.VITE_ADSENSE_SLOT_PRODUCT || '',
};
