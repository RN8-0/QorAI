// Renders AI plain-text output with light markup: **bold**, bullet
// lines (-, •, *) and blank-line spacing.
export default function AiText({ text }) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 8 }} />;

    const bullet = /^[-•*]\s+/.test(trimmed);
    const body = bullet ? trimmed.replace(/^[-•*]\s+/, '') : trimmed;
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={j}>{seg.slice(2, -2)}</strong>
        : seg,
    );
    return (
      <p key={i} className={'ai-line' + (bullet ? ' ai-bullet' : '')}>
        {parts}
      </p>
    );
  });
}
