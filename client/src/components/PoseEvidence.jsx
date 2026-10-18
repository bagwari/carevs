import { useEffect, useState } from 'react';

// Stylized pose-keypoint "evidence clip" — represents the edge-processed
// skeleton tracking described in the architecture (no raw video ever shown).
export default function PoseEvidence({ status, confidence, room }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const falling = status === 'confirmed' || status === 'escalated' || status === 'acknowledged' || status === 'dismissed';
  const wobbling = status === 'candidate' || status === 'suspected';

  const groupClass = falling ? 'fallen' : wobbling ? 'wobble' : 'upright';
  const label = falling ? 'PERSON — ON FLOOR' : wobbling ? 'PERSON — VERIFYING' : 'PERSON — STANDING';
  const boxY = falling ? 118 : 40;
  const boxH = falling ? 46 : 130;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="evidence-panel">
      <div className="evidence-panel__frame">
        <svg viewBox="0 0 220 190" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#1b2740" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="220" height="190" fill="#0e1626" />
          <rect width="220" height="190" fill="url(#grid)" />
          <line x1="0" y1="168" x2="220" y2="168" stroke="#243352" strokeWidth="2" />

          <rect
            x="55"
            y={boxY}
            width="70"
            height={boxH}
            fill="none"
            stroke={falling ? '#f04438' : wobbling ? '#f79009' : '#22c55e'}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            style={{ transition: 'all 0.7s ease' }}
          />

          <g className={`pose-figure ${groupClass}`} stroke="#7dd3fc" strokeWidth="3.2" strokeLinecap="round" fill="#7dd3fc">
            {/* head */}
            <circle cx="90" cy="52" r="8" />
            {/* spine */}
            <line x1="90" y1="60" x2="90" y2="102" />
            {/* arms */}
            <line x1="90" y1="72" x2="72" y2="92" />
            <line x1="90" y1="72" x2="108" y2="92" />
            {/* hips to legs */}
            <line x1="90" y1="102" x2="76" y2="140" />
            <line x1="90" y1="102" x2="104" y2="140" />
            <line x1="76" y1="140" x2="72" y2="166" />
            <line x1="104" y1="140" x2="108" y2="166" />
          </g>

          <text x="10" y="16" fill="#e2e8f0" fontSize="8" fontFamily="monospace" letterSpacing="0.5">
            EDGE-NODE-01 · {room?.toUpperCase() ?? 'LIVING ROOM'}
          </text>
          <text x="10" y="29" fill="#94a3b8" fontSize="8" fontFamily="monospace">
            {label}
          </text>
          <text x="10" y="182" fill="#64748b" fontSize="8.5" fontFamily="monospace">
            {mm}:{ss} · pose keypoints only · no raw frame stored
          </text>
          <circle cx="204" cy="14" r="4" fill="#f04438">
            <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <div className="evidence-panel__caption">
        Confidence {(confidence * 100).toFixed(0)}% · Pose-keypoint clip, edge-processed — no raw video leaves the home
      </div>

      <style>{`
        .pose-figure { transform-origin: 90px 168px; transition: transform 0.9s cubic-bezier(.36,.07,.19,.97); }
        .pose-figure.upright { transform: rotate(0deg) translate(0, 0); }
        .pose-figure.wobble { animation: wobble-anim 0.6s ease-in-out infinite; }
        .pose-figure.fallen { transform: rotate(80deg) translate(-6px, -10px); }
        @keyframes wobble-anim {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(5deg); }
        }
      `}</style>
    </div>
  );
}
