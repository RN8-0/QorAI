const ID_RE = /[a-z0-9]{15}$/i;

export function slugifyProduct(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function productSlug(product) {
  if (!product || typeof product !== 'object') return '';
  return slugifyProduct(product.slug || product.name || '');
}

export function extractProductId(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  const exact = clean.match(/^[a-z0-9]{15}$/i);
  if (exact) return clean;
  const tail = clean.match(ID_RE);
  return tail ? tail[0] : clean;
}

export function productPath(productOrId) {
  const isProduct = productOrId && typeof productOrId === 'object';
  const id = String(isProduct ? productOrId.id : productOrId || '').trim();
  if (!id) return '/product';
  const slug = isProduct ? productSlug(productOrId) : '';
  const qs = new URLSearchParams();
  if (slug) qs.set('slug', slug);
  qs.set('id', id);
  return `/product?${qs.toString()}`;
}
