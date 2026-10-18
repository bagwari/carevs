import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PipelineStrip from '../components/PipelineStrip';
import { api } from '../lib/api';

function shortDate(d) {
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Trends() {
  const [trend, setTrend] = useState(null);
  const [elder, setElder] = useState(null);

  useEffect(() => {
    api.getTrend('elder-1').then(({ trend, elder }) => {
      setTrend(trend);
      setElder(elder);
    });
  }, []);

  if (!trend) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const declineStart = trend.days.findIndex((d) => d.inDecline);
  const declineStartDate = trend.days[declineStart]?.date;
  const lastDate = trend.days[trend.days.length - 1]?.date;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Behavioral Trends — {elder?.name}</h1>
        <p>Prevent stage: a personal baseline built from 14 days of activity, flagged the moment it drifted.</p>
      </div>

      <PipelineStrip activeKey="prevent" />
      <div style={{ height: 18 }} />

      <div className="card" style={{ background: 'linear-gradient(135deg,#f5f0ff,#ffffff)', borderColor: '#e2d6fb', marginBottom: 20 }}>
        <div className="section-title" style={{ color: 'var(--admin)' }}>Prevent-stage insight</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{trend.summary.headline}</div>
        <p style={{ margin: 0, color: 'var(--ink)' }}>{trend.summary.recommendation}</p>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="section-title">{trend.metricLabels.nightTimeStillness}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend.days} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              {declineStartDate && (
                <ReferenceArea x1={declineStartDate} x2={lastDate} fill="#f04438" fillOpacity={0.06} />
              )}
              <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} stroke="#98a2b3" />
              <YAxis fontSize={11} stroke="#98a2b3" domain={[40, 100]} />
              <Tooltip labelFormatter={shortDate} formatter={(v) => [`${v}%`, 'Stillness']} />
              <Line type="monotone" dataKey="nightTimeStillness" stroke="#2f6fed" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-title">{trend.metricLabels.commonAreaMinutes}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend.days} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              {declineStartDate && (
                <ReferenceArea x1={declineStartDate} x2={lastDate} fill="#f04438" fillOpacity={0.06} />
              )}
              <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} stroke="#98a2b3" />
              <YAxis fontSize={11} stroke="#98a2b3" domain={[0, 80]} />
              <Tooltip labelFormatter={shortDate} formatter={(v) => [`${v} min`, 'Common-area time']} />
              <Line type="monotone" dataKey="commonAreaMinutes" stroke="#0e9384" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title">{trend.metricLabels.socialPresenceMinutes}</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend.days} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
            {declineStartDate && <ReferenceArea x1={declineStartDate} x2={lastDate} fill="#f04438" fillOpacity={0.06} />}
            <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} stroke="#98a2b3" />
            <YAxis fontSize={11} stroke="#98a2b3" domain={[0, 130]} />
            <Tooltip labelFormatter={shortDate} formatter={(v) => [`${v} min`, 'With another person']} />
            <Line type="monotone" dataKey="socialPresenceMinutes" stroke="#7a5af8" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Down <strong style={{ color: 'var(--danger)' }}>{trend.summary.socialPresenceChangePct}%</strong> —{' '}
          {trend.summary.daysSinceVisitor} days since anyone was detected in the home with her, against a baseline of
          about {trend.summary.visitorsPerWeekBaseline} visits a week. Note the ordering: visits stopped{' '}
          <strong>{trend.summary.isolationLeadDays} days before</strong> her own activity started falling. Isolation is
          the leading signal here, not a consequence — and the system routes it to a person rather than filling the gap
          itself.
        </p>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="section-title">Night-time stillness change</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{trend.summary.nightTimeStillnessChangePct}%</div>
          <p className="muted" style={{ fontSize: 13 }}>over the last {trend.summary.windowDays} days, vs. {elder?.name?.split(' ')[0]}'s own baseline</p>
        </div>
        <div className="card">
          <div className="section-title">Common-area time change</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{trend.summary.commonAreaTimeChangePct}%</div>
          <p className="muted" style={{ fontSize: 13 }}>over the last {trend.summary.windowDays} days, vs. {elder?.name?.split(' ')[0]}'s own baseline</p>
        </div>
      </div>
    </div>
  );
}
