export function productPath(id) {
  return `/product?id=${encodeURIComponent(String(id || ''))}`;
}
