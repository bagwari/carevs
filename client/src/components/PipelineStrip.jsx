import { PIPELINE_STAGES } from '../lib/pipeline';

export default function PipelineStrip({ activeKey }) {
  return (
    <div className="pipeline-strip">
      {PIPELINE_STAGES.map((s) => (
        <div key={s.key} className={`pipeline-node ${s.key === activeKey ? 'active' : ''}`}>
          {s.label}
        </div>
      ))}
    </div>
  );
}
