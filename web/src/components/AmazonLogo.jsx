// Inline Amazon wordmark + smile. `currentColor` lets the wordmark adapt to the
// light/dark theme; the smile + arrowhead keep the Amazon orange.
export default function AmazonLogo({ height = 22, className }) {
  return (
    <svg viewBox="0 0 92 24" height={height} role="img" aria-label="Amazon"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <text x="2" y="15" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700"
        fontSize="16" fill="currentColor">amazon</text>
      <path d="M7 18 Q 44 27 80 18" stroke="#FF9900" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M80 18 l-5 -1 M80 18 l-2 4" stroke="#FF9900" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
