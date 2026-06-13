const COUNTRY_SKU_RE = /\b[A-Z0-9]{4,}[A-Z]{1,3}\/[A-Z]\b/g;
const COUNTRY_SKU_GROUP_RE = /\s*[\[(][^\])]*\b[A-Z0-9]{4,}[A-Z]{1,3}\/[A-Z]\b[^\])]*[\])]/g;

export function cleanProductName(name) {
  return String(name || '')
    .replace(COUNTRY_SKU_GROUP_RE, '')
    .replace(COUNTRY_SKU_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/\s+([.)])/g, '$1')
    .trim();
}

export function displayProductName(product, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const translated = product?.nameTranslated?.[code];
  return cleanProductName(translated && String(translated).trim() ? translated : product?.name || '');
}
