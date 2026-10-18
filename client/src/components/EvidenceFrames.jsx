import { useState } from 'react';

export default function EvidenceFrames({ frames, confidence }) {
  const [active, setActive] = useState(frames.length - 1);
  const current = frames[active] ?? frames[0];

  return (
    <div className="evidence-panel">
      <div className="evidence-panel__frame" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={current.dataUrl} alt={`Evidence frame ${current.label}`} style={{ width: '100%', display: 'block' }} />
        <div className="evidence-panel__tag">{current.label}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {frames.map((f, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              padding: 0,
              border: i === active ? '2px solid #38bdf8' : '2px solid transparent',
              borderRadius: 6,
              background: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            <img src={f.dataUrl} alt={f.label} style={{ width: 62, borderRadius: 4, display: 'block' }} />
          </button>
        ))}
      </div>

      <div className="evidence-panel__caption">
        Confidence {(confidence * 100).toFixed(0)}% · {frames.length} key frames saved at the moment of the event — no
        continuous recording is kept
      </div>
    </div>
  );
}
