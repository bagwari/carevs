import { useState } from 'react';
import { PIPELINE_STAGES } from '../lib/pipeline';

const DEMO_TAGS = {
  observe: 'Shown: the healthy baseline console — edge inference running quietly on the home CCTV feed.',
  understand: 'Shown: pose-keypoint candidate check, and zone crossings read differently with a companion in frame.',
  alert: 'Shown: fall suspected → confirmed in real time, reaching the caregiver console within seconds.',
  recommend: 'Shown: the explainable alert card — evidence, confidence, and a one-tap next action.',
  prevent: 'Shown: a 5-day behavioral decline — night stillness −40%, common-area time −60% — caught before a crisis.',
};

export default function PipelineClose() {
  const [active, setActive] = useState(null);

  return (
    <div className="page">
      <div className="page-header">
        <h1>The five-stage pipeline</h1>
        <p>What you just saw, mapped back to the architecture.</p>
      </div>

      <div className="pipeline-diagram">
        {PIPELINE_STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`pipeline-card ${active === s.key ? 'active' : ''}`}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <h3 style={{ margin: 0 }}>{s.label}</h3>
            </div>
            <p style={{ marginLeft: 40 }}>{s.blurb}</p>
            <div style={{ marginLeft: 40 }}>
              <span className="demo-tag">{DEMO_TAGS[s.key]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <div className="section-title">Built to the 4Ms of an age-friendly health system</div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
          The IHI framework the Johns Hopkins / National Institute on Aging summit recommends designing to — stage-of-life
          needs, not technical novelty. Here is what CareVS actually covers, and what it does not.
        </p>
        <div className="fourm-grid">
          <div className="fourm-card">
            <h4>What Matters</h4>
            <p>The person's own goals and preferences.</p>
            <span className="cover-tag muted">Not covered</span>
          </div>
          <div className="fourm-card">
            <h4>Medication</h4>
            <p>Safe, reviewed and understood.</p>
            <span className="cover-tag muted">Not covered — refused by policy</span>
          </div>
          <div className="fourm-card partial">
            <h4>Mentation</h4>
            <p>Cognition, mood and delirium.</p>
            <span className="cover-tag" style={{ color: '#b25e00' }}>Partial — behavioural drift</span>
          </div>
          <div className="fourm-card covered">
            <h4>Mobility</h4>
            <p>Moving safely and staying active.</p>
            <span className="cover-tag" style={{ color: '#067a45' }}>Covered — falls, perimeter</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, textAlign: 'center', background: 'linear-gradient(135deg,#eef4ff,#ffffff)' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          The point is not "AI detection." It's reducing the time between a risk emerging and the right person taking the
          right action — while keeping privacy, evidence and human judgement at the centre.
        </p>
      </div>
    </div>
  );
}
