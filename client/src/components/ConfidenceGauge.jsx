export default function ConfidenceGauge({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--warn)' : 'var(--muted)';
  return (
    <div className="confidence-gauge">
      <div className="confidence-gauge__track">
        <div className="confidence-gauge__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="confidence-gauge__label" style={{ color }}>
        {pct}%
      </div>
    </div>
  );
}
