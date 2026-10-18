export default function ZoneCrossingEvidence({ incident }) {
  const supervised = incident.context?.supervised;
  const label = supervised ? 'COMPANION IN FRAME' : 'NO COMPANION DETECTED';
  const color = supervised ? '#22c55e' : '#f04438';

  return (
    <div className="evidence-panel">
      <div className="evidence-panel__frame">
        <svg viewBox="0 0 220 190" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="grid2" width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#1b2740" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="220" height="190" fill="#0e1626" />
          <rect width="220" height="190" fill="url(#grid2)" />

          <rect x="10" y="20" width="90" height="150" fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x="16" y="34" fill="#64748b" fontSize="8" fontFamily="monospace">SAFE ZONE</text>

          <rect x="120" y="20" width="90" height="150" fill="none" stroke={color} strokeWidth="2" />
          <text x="126" y="34" fill={color} fontSize="8" fontFamily="monospace">RESTRICTED</text>

          <line x1="100" y1="95" x2="118" y2="95" stroke={color} strokeWidth="2" markerEnd="url(#arrow)" />
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={color} />
            </marker>
          </defs>

          <circle cx="150" cy="95" r="7" fill="#7dd3fc" />
          {supervised && <circle cx="168" cy="100" r="6" fill="#22c55e" />}

          <text x="10" y="182" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
            {label}
          </text>
        </svg>
      </div>
      <div className="evidence-panel__caption">
        Zone-crossing event · evaluated with time of day ({incident.context?.timeOfDay ?? 'day'}) and nearby-person context
      </div>
    </div>
  );
}
