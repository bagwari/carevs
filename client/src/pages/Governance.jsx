import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

function fmt(iso) {
  return new Date(iso).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Metric({ label, value, suffix, hint, tone }) {
  return (
    <div className="card metric-card">
      <div className="section-title" style={{ marginBottom: 6 }}>{label}</div>
      <div className="metric-card__value" style={tone ? { color: tone } : undefined}>
        {value == null ? '—' : value}
        {value != null && suffix ? <span className="metric-card__suffix">{suffix}</span> : null}
      </div>
      {hint && <p className="metric-card__hint">{hint}</p>}
    </div>
  );
}

export default function Governance() {
  const { user } = useAuth();
  const [consent, setConsent] = useState(null);
  const [audit, setAudit] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [probe, setProbe] = useState('Give her 5mg of warfarin now');
  const [probeResult, setProbeResult] = useState(null);

  const load = useCallback(() => {
    api.getConsent().then(({ consent }) => setConsent(consent)).catch((e) => setError(e.message));
    api.getAudit().then(setAudit).catch(() => {});
    api.getAdoptionMetrics().then(({ metrics }) => setMetrics(metrics)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const toggle = async (purposeId, granted) => {
    setBusy(purposeId);
    setError(null);
    try {
      const { consent } = await api.setConsent(purposeId, granted);
      setConsent(consent);
      api.getAudit().then(setAudit).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const runProbe = async () => {
    setProbeResult(null);
    try {
      const { result } = await api.probeValidator(probe);
      setProbeResult(result);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Governance</h1>
        <p>Consent, access trail and adoption — the three things that decide whether this stays switched on.</p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 18 }}>
          <strong style={{ color: 'var(--danger)' }}>{error}</strong>
        </div>
      )}

      {/* ---------------- Adoption ---------------- */}
      <h2 className="gov-heading">Adoption</h2>
      <p className="gov-sub">
        A device in a drawer protects nobody. These are the numbers that predict abandonment — and they matter
        more than detector accuracy.
      </p>
      {metrics && (
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <Metric
            label="Response rate"
            value={metrics.responseRatePct}
            suffix="%"
            hint="Alerts the caregiver acted on. The leading indicator of a system about to be ignored."
            tone={metrics.responseRatePct >= 80 ? 'var(--safe)' : 'var(--warn)'}
          />
          <Metric
            label="Median response"
            value={metrics.medianResponseSeconds}
            suffix="s"
            hint="From alert raised to caregiver decision."
          />
          <Metric
            label="Dismissal rate"
            value={metrics.dismissalRatePct}
            suffix="%"
            hint="High dismissal means the detector is crying wolf. Watch this before accuracy."
            tone={metrics.dismissalRatePct > 40 ? 'var(--danger)' : 'var(--safe)'}
          />
        </div>
      )}
      {metrics && (
        <div className="grid cols-3">
          <Metric label="Actionable alerts" value={metrics.actionableAlerts} hint="Alerts that asked for a decision." />
          <Metric label="Escalation rate" value={metrics.escalationRatePct} suffix="%" hint="Sent onward for help." />
          <Metric
            label="Auto-suppressed"
            value={metrics.autoSuppressed}
            hint="Candidates the detector stood down on its own — alerts nobody had to see."
            tone="var(--safe)"
          />
        </div>
      )}

      {/* ---------------- Consent ---------------- */}
      <h2 className="gov-heading">Consent — DPDP Act</h2>
      <p className="gov-sub">
        Notice, purpose limitation, and withdrawal that is as easy as giving consent. Withdrawing a purpose here
        changes what the server releases — it is not a display setting.
      </p>

      {consent && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="consent-head">
              <div>
                <div style={{ fontWeight: 700 }}>{consent.dataPrincipal}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Data principal · consent given {fmt(consent.grantedOn)} · notice v{consent.noticeVersion}
                </div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
              <strong>Retention:</strong> {consent.retention}
            </p>
          </div>

          {consent.purposes.map((p) => (
            <div key={p.id} className={`consent-row ${p.experimental ? 'phase2' : ''}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="consent-row__title">
                  {p.label}
                  {p.essential && <span className="consent-row__tag">essential</span>}
                  {p.experimental && <span className="consent-row__tag phase2">Phase {p.phase} · not built</span>}
                </div>
                <div className="consent-row__desc">{p.description}</div>
                <div className="consent-row__data">{p.dataUsed}</div>
                {p.validationQuestion && (
                  <div className="consent-row__question">
                    <strong>Open validation question:</strong> {p.validationQuestion}
                  </div>
                )}
              </div>
              <button
                className={`btn small ${p.granted ? '' : 'primary'}`}
                disabled={
                  busy === p.id ||
                  user.role !== 'caregiver' ||
                  (p.essential && p.granted) ||
                  (p.experimental && !p.granted)
                }
                onClick={() => toggle(p.id, !p.granted)}
                title={
                  p.experimental
                    ? 'Blocked until a validation study and revised notice exist'
                    : user.role !== 'caregiver'
                      ? 'Only the caregiver can change consent'
                      : undefined
                }
              >
                {p.granted ? 'Withdraw' : 'Give consent'}
              </button>
              <span className={`status-pill ${p.experimental ? 'candidate' : p.granted ? 'logged' : 'dismissed'}`}>
                {p.experimental ? 'not offered' : p.granted ? 'granted' : 'withdrawn'}
              </span>
            </div>
          ))}

          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-title">Consent history</div>
            <div className="timeline">
              {consent.history.map((h, i) => (
                <div key={i} className="timeline-item">
                  <time>{fmt(h.ts)}</time>
                  <span>
                    {h.event} <span className="muted">· {h.actor}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---------------- Validator probe ---------------- */}
      <h2 className="gov-heading">Safety gate</h2>
      <p className="gov-sub">
        Recommendations pass a Validator before a caregiver ever sees them. Clinical content is refused by policy.
        Try it — the gate runs on the server.
      </p>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="gov-input"
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
            placeholder="Type a recommendation to test…"
            onKeyDown={(e) => e.key === 'Enter' && runProbe()}
          />
          <button className="btn primary" onClick={runProbe}>
            Test
          </button>
        </div>
        {probeResult && (
          <div
            className="gov-probe-result"
            style={{
              background: probeResult.passed ? 'var(--safe-bg)' : 'var(--danger-bg)',
              color: probeResult.passed ? '#067a45' : '#b3261e',
            }}
          >
            <strong>{probeResult.passed ? 'PASSED' : 'BLOCKED'}</strong> — {probeResult.reason}
          </div>
        )}
      </div>

      {/* ---------------- Audit ---------------- */}
      <h2 className="gov-heading">Access trail</h2>
      <p className="gov-sub">
        Every read is logged, including reads that returned masked data — so masking can be shown, not just claimed.
      </p>
      {audit && (
        <div className="card">
          <div className="audit-summary">
            <span>
              <strong>{audit.summary.total}</strong> entries
            </span>
            {Object.entries(audit.summary.byRole).map(([r, n]) => (
              <span key={r} className="muted">
                {r}: <strong>{n}</strong>
              </span>
            ))}
            {audit.summary.denied > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                denied: <strong>{audit.summary.denied}</strong>
              </span>
            )}
          </div>
          <div className="audit-scroll">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {audit.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{fmt(e.ts)}</td>
                    <td>
                      <span className={`role-badge ${e.role}`} style={{ fontSize: 10 }}>
                        {e.role}
                      </span>
                    </td>
                    <td className="mono">{e.action}</td>
                    <td className="mono">{e.resource}</td>
                    <td>
                      <span className={`status-pill ${e.outcome === 'allowed' ? 'logged' : 'confirmed'}`}>
                        {e.outcome}
                      </span>
                      {e.detail && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.detail}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
