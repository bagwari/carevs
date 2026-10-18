const STEPS = ['candidate', 'suspected', 'confirming', 'confirmed'];

export default function StateTrack({ status }) {
  const activeIndex = status === 'candidate' ? 0 : status === 'suspected' ? 2 : 3;
  const isDanger = ['confirmed', 'escalated', 'acknowledged', 'dismissed'].includes(status);

  return (
    <div>
      <div className="state-track">
        {STEPS.map((step, i) => {
          let cls = '';
          if (i < activeIndex) cls = 'done';
          else if (i === activeIndex) cls = isDanger ? 'danger' : 'active';
          return <div key={step} className={`state-track__step ${cls}`} />;
        })}
      </div>
      <div className="state-track__labels">
        <span>Stage 1: candidate</span>
        <span>Suspected</span>
        <span>Stage 2: confirming</span>
        <span>Confirmed</span>
      </div>
    </div>
  );
}
