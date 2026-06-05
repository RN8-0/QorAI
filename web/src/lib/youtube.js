const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

function youtubeApiKey() {
  return String(
    import.meta.env.VITE_YOUTUBE_API_KEY
      || (typeof window !== 'undefined' && window.__QOR_CONFIG__?.youtubeApiKey)
      || (typeof window !== 'undefined' && window.QOR_YOUTUBE_API_KEY)
      || '',
  ).trim();
}

export async function searchYoutubeReviews(productName, limit = 2) {
  const key = youtubeApiKey();
  const name = String(productName || '').trim();
  if (!key || !name) return [];
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(Math.max(1, Math.min(5, limit))),
    order: 'relevance',
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
    key,
    q: `${name} review long term`,
  });
  const res = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || [])
    .map((item) => {
      const id = item?.id?.videoId || '';
      const snippet = item?.snippet || {};
      if (!id) return null;
      return {
        id,
        title: snippet.title || '',
        channel: snippet.channelTitle || '',
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      };
    })
    .filter(Boolean);
}
