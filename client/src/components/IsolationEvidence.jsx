// Evidence for a social-isolation flag: a 14-day strip of days-with-company.
// Deliberately coarse — a daily yes/no is all the detector keeps, and showing
// that is the point. No identity, no audio, no conversation content.

export default function IsolationEvidence({ incident, days = [] }) {
  const c = incident.context ?? {};
  const recent = days.slice(-14);

  return (
    <div className="evidence-panel">
      <div className="evidence-panel__frame isolation-frame">
        <div className="iso-strip">
          {recent.map((d, i) => {
            const hadCompany = (d.socialPresenceMinutes ?? 0) > 20;
            return (
              <div
                key={d.date ?? i}
                className={`iso-cell ${hadCompany ? 'with' : 'alone'}`}
                title={`${d.date}: ${hadCompany ? 'someone present' : 'alone'}`}
              />
            );
          })}
        </div>
        <div className="iso-legend">
          <span><i className="iso-key with" /> someone present</span>
          <span><i className="iso-key alone" /> alone all day</span>
        </div>
        <div className="iso-stat">
          <div className="iso-stat__value">{c.daysSinceVisitor ?? '—'}</div>
          <div className="iso-stat__label">days since anyone visited</div>
        </div>
      </div>
      <div className="evidence-panel__caption">
        Daily presence counts only · no identity, no audio, no conversation content
      </div>
    </div>
  );
}
