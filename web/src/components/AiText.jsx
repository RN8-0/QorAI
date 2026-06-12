// Renders AI plain-text output with light markup while hiding model-side
// Markdown noise such as "###" headings and ``` fences.
export default function AiText({ text }) {
  return String(text || '').split('\n').map((line, i) => {
    let trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 8 }} />;
    if (/^```(?:json|javascript|js|ts)?\s*$/i.test(trimmed)) return null;

    const heading = /^#{1,6}\s+/.test(trimmed);
    trimmed = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s+/, '')
      .replace(/^["']?([A-Za-zÇĞİÖŞÜçğıöşü0-9 _-]{2,32})["']?\s*:\s*$/, '$1');

    const bullet = /^[-•*]\s+/.test(trimmed);
    const body = bullet ? trimmed.replace(/^[-•*]\s+/, '') : trimmed;
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={j}>{seg.slice(2, -2)}</strong>
        : seg,
    );
    return (
      <p key={i} className={'ai-line' + (heading ? ' ai-heading' : '') + (bullet ? ' ai-bullet' : '')}>
        {parts}
      </p>
    );
  });
}
