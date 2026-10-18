// Renders the multi-agent chain behind a recommendation.
// The source paper's proposed mitigation for LLM hallucination is exactly this:
// Validator and Critic sub-agents cross-checking output, plus human sign-off.

const OUTCOME_STYLE = {
  proposed: { color: 'var(--primary-ink)', bg: '#e7f0ff', mark: '✎' },
  passed: { color: '#067a45', bg: 'var(--safe-bg)', mark: '✓' },
  flagged: { color: '#b25e00', bg: 'var(--warn-bg)', mark: '!' },
  rejected: { color: '#b3261e', bg: 'var(--danger-bg)', mark: '✕' },
  pending: { color: 'var(--muted)', bg: '#eef1f5', mark: '⋯' },
  'no-op': { color: 'var(--muted)', bg: '#eef1f5', mark: '–' },
};

export default function RecommendationChain({ chain, requiresHumanSignOff }) {
  if (!chain?.length) return null;

  return (
    <div className="rec-chain">
      <div className="section-title" style={{ marginBottom: 8 }}>
        How this recommendation was produced
      </div>
      {chain.map((step, i) => {
        const s = OUTCOME_STYLE[step.outcome] ?? OUTCOME_STYLE.pending;
        return (
          <div key={i} className="rec-chain__step">
            <span className="rec-chain__mark" style={{ background: s.bg, color: s.color }}>
              {s.mark}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rec-chain__agent">
                {step.agent}
                <span className="rec-chain__outcome" style={{ color: s.color }}>
                  {step.outcome}
                </span>
              </div>
              <div className="rec-chain__detail">{step.detail}</div>
            </div>
          </div>
        );
      })}
      {requiresHumanSignOff && (
        <p className="rec-chain__note">
          No action is taken automatically. Clinical advice is refused by policy, not by judgement.
        </p>
      )}
    </div>
  );
}
