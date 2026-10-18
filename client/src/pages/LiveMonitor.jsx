import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PipelineStrip from '../components/PipelineStrip';
import { api } from '../lib/api';
import { SceneTracker, extractPoseMetrics } from '../lib/fallDetector';
import { FrameBuffer } from '../lib/frameBuffer';

const SKELETON = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

const TARGET_FPS = 8;

export default function LiveMonitor() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const fallDetectorRef = useRef(null);
  const bufferRef = useRef(null);
  const rafRef = useRef(null);
  const incidentIdRef = useRef(null);
  const lastRunRef = useRef(0);

  const [status, setStatus] = useState('idle'); // idle | loading | running | error
  const [error, setError] = useState(null);
  const [detState, setDetState] = useState('monitoring');
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [suppressions, setSuppressions] = useState([]);
  const [sceneInfo, setSceneInfo] = useState({ personCount: 0, degraded: false });
  const [watchProgress, setWatchProgress] = useState(0);

  const log = useCallback((message, tone = 'info') => {
    setEvents((prev) => [{ message, tone, t: new Date() }, ...prev].slice(0, 12));
  }, []);

  const handleStateChange = useCallback(
    async (evt) => {
      // Suppressions are not state transitions — the detector stays in
      // monitoring. They are logged so the cultural calibration is visible.
      if (evt.state === 'suppressed') {
        setSuppressions((prev) => [{ rule: evt.rule, reason: evt.reason, t: new Date() }, ...prev].slice(0, 8));
        return;
      }

      setDetState(evt.state);

      if (evt.state === 'suspected') {
        log(`Stage 1 — candidate detected. ${evt.reason}`, 'warn');
        const frames = bufferRef.current.keyframesAround(3);
        try {
          const { incident } = await api.startLiveFall({
            reason: evt.reason,
            metrics: evt.metrics,
            frames,
          });
          incidentIdRef.current = incident.id;
        } catch (e) {
          log(`Could not open incident: ${e.message}`, 'danger');
        }
        return;
      }

      if (evt.state === 'recovered') {
        log(`Stage 2 — ${evt.reason}. Reset quietly.`, 'safe');
        setWatchProgress(0);
        if (incidentIdRef.current) {
          await api
            .advanceLiveFall(incidentIdRef.current, { outcome: 'recovered', reason: evt.reason })
            .catch(() => {});
          incidentIdRef.current = null;
        }
        return;
      }

      if (evt.state === 'confirmed') {
        log(`Stage 2 — FALL CONFIRMED. ${evt.reason}`, 'danger');
        setWatchProgress(1);
        const frames = bufferRef.current.keyframesAround(2);
        if (incidentIdRef.current) {
          await api
            .advanceLiveFall(incidentIdRef.current, {
              outcome: 'confirmed',
              reason: evt.reason,
              frames,
              confidence: evt.confidence,
              motionEnergy: evt.motionEnergy,
            })
            .catch(() => {});
        }
      }
    },
    [log]
  );

  const drawOverlay = useCallback((poses, video) => {
    const canvas = canvasRef.current;
    if (!canvas || !video?.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!poses?.length) return;

    // One colour per tracked person, so the audience can see the system is
    // following two bodies separately rather than blending them.
    const TRACK_COLOURS = ['#7dd3fc', '#fbbf24', '#a78bfa', '#4ade80', '#f472b6'];

    poses.forEach((pose, idx) => {
      const stroke = TRACK_COLOURS[idx % TRACK_COLOURS.length];
      const byName = {};
      for (const kp of pose.keypoints) if (kp.score >= 0.3) byName[kp.name] = kp;

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4;
      for (const [a, b] of SKELETON) {
        const ka = byName[a];
        const kb = byName[b];
        if (!ka || !kb) continue;
        ctx.beginPath();
        ctx.moveTo(ka.x, ka.y);
        ctx.lineTo(kb.x, kb.y);
        ctx.stroke();
      }

      ctx.fillStyle = stroke;
      for (const kp of Object.values(byName)) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      const head = byName.nose ?? Object.values(byName)[0];
      if (head && pose.id != null) {
        ctx.fillStyle = stroke;
        ctx.font = 'bold 20px ui-monospace, monospace';
        ctx.fillText(`#${pose.id}`, head.x + 14, head.y - 14);
      }

      const xs = Object.values(byName).map((k) => k.x);
      const ys = Object.values(byName).map((k) => k.y);
      if (xs.length) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys)
        );
        ctx.setLineDash([]);
      }
    });
  }, []);

  const loop = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    if (now - lastRunRef.current >= 1000 / TARGET_FPS) {
      lastRunRef.current = now;
      try {
        const poses = await detector.estimatePoses(video, { maxPoses: 5, flipHorizontal: false });
        drawOverlay(poses ?? [], video);

        bufferRef.current.capture(video, 'buffer');

        const scene = fallDetectorRef.current.push(poses ?? [], video.videoWidth, video.videoHeight, now);
        setSceneInfo(scene);

        const primary = poses?.[0]
          ? extractPoseMetrics(poses[0], video.videoWidth, video.videoHeight, now)
          : null;
        if (primary) setLiveMetrics(primary);

        // Progress reflects whichever person is currently mid-confirmation.
        const watching = [...fallDetectorRef.current.tracks.values()]
          .map((t) => t.detector.status())
          .find((s) => s.state === 'suspected');
        setWatchProgress(watching ? Math.min(watching.elapsed / watching.confirmWindowMs, 1) : 0);
      } catch {
        // transient inference errors are non-fatal; keep the loop alive
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [drawOverlay]);

  const start = async () => {
    setStatus('loading');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const [tf, poseDetection] = await Promise.all([
        import('@tensorflow/tfjs-core'),
        import('@tensorflow-models/pose-detection'),
      ]);
      await import('@tensorflow/tfjs-backend-webgl');
      await tf.setBackend('webgl');
      await tf.ready();

      // MultiPose + the built-in tracker gives every person in frame a
      // persistent id, so one detector can run per person instead of one
      // detector seeing a blend of everybody.
      detectorRef.current = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
      });

      bufferRef.current = new FrameBuffer(24);
      fallDetectorRef.current = new SceneTracker(handleStateChange);

      setStatus('running');
      log('Edge inference started — pose keypoints only, no recording kept.', 'safe');
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setStatus('error');
      setError(e.message || String(e));
    }
  };

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current?.dispose?.();
    detectorRef.current = null;
    bufferRef.current?.clear();
    setStatus('idle');
    setDetState('monitoring');
    setWatchProgress(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const stateColor =
    detState === 'confirmed' ? 'var(--danger)' : detState === 'suspected' ? 'var(--warn)' : 'var(--safe)';
  const stateLabel =
    detState === 'confirmed'
      ? 'FALL CONFIRMED'
      : detState === 'suspected'
        ? 'FALL SUSPECTED — verifying'
        : 'Monitoring — normal';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Live Monitor — Edge Inference</h1>
        <p>
          Pose detection runs entirely in this browser. Raw video never leaves the device — only key frames around a
          suspected event are saved for the caregiver to review.
        </p>
      </div>

      <PipelineStrip activeKey={detState === 'confirmed' ? 'alert' : detState === 'suspected' ? 'understand' : 'observe'} />
      <div style={{ height: 18 }} />

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="section-title">Camera feed</div>
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#0e1626' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {status !== 'running' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: 14,
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                {status === 'loading' ? 'Loading pose model…' : 'Camera off'}
              </div>
            )}
          </div>

          <div className="actions-row">
            {status !== 'running' ? (
              <button className="btn primary" onClick={start} disabled={status === 'loading'}>
                {status === 'loading' ? 'Starting…' : 'Start live monitoring'}
              </button>
            ) : (
              <button className="btn" onClick={stop}>
                Stop
              </button>
            )}
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 0 }}>
              Camera or model failed to start: {error}
            </p>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16, borderColor: stateColor }}>
            <div className="section-title">Detector state</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: stateColor, marginBottom: 10 }}>{stateLabel}</div>

            {detState === 'suspected' && (
              <>
                <div className="confidence-gauge__track" style={{ marginBottom: 6 }}>
                  <div
                    className="confidence-gauge__fill"
                    style={{ width: `${watchProgress * 100}%`, background: 'var(--warn)' }}
                  />
                </div>
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                  Stage 2 confirmation window — watching for recovery motion
                </p>
              </>
            )}

            {liveMetrics && status === 'running' && (
              <div className="grid cols-3" style={{ marginTop: 14, gap: 10 }}>
                <div className="qa-item">
                  <div className="qa-item__label">Torso height</div>
                  <div className="qa-item__value">{(1 - liveMetrics.torsoY).toFixed(2)}</div>
                </div>
                <div className="qa-item">
                  <div className="qa-item__label">Body aspect</div>
                  <div className="qa-item__value">{liveMetrics.aspect.toFixed(2)}</div>
                </div>
                <div className="qa-item">
                  <div className="qa-item__label">Keypoints</div>
                  <div className="qa-item__value">{liveMetrics.visibleCount}</div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">Detection log</div>
            {events.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing yet.</p>}
            {events.map((e, i) => (
              <div key={i} className="timeline-item">
                <time>{e.t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <span
                  style={{
                    color:
                      e.tone === 'danger'
                        ? 'var(--danger)'
                        : e.tone === 'warn'
                          ? '#b25e00'
                          : e.tone === 'safe'
                            ? '#067a45'
                            : 'inherit',
                  }}
                >
                  {e.message}
                </span>
              </div>
            ))}
            {incidentIdRef.current && detState === 'confirmed' && (
              <button
                className="btn danger block"
                style={{ marginTop: 12 }}
                onClick={() => navigate(`/incidents/${incidentIdRef.current}`)}
              >
                Open incident with captured evidence →
              </button>
            )}
          </div>

          <div className="card">
            <div className="section-title">People in frame</div>
            <div className="scene-row">
              <span className="scene-count">{sceneInfo.personCount}</span>
              <span className="scene-note">
                {sceneInfo.degraded
                  ? 'Coverage degraded — too many people to track reliably. The system says so rather than guessing.'
                  : sceneInfo.personCount > 1
                    ? 'Each person is tracked separately. A fall with a companion who responds is logged, not escalated.'
                    : sceneInfo.personCount === 1
                      ? 'Single occupant — a fall here escalates in full.'
                      : 'Nobody detected.'}
              </span>
            </div>
            {sceneInfo.degraded && (
              <div className="scene-degraded">⚠ Coverage degraded</div>
            )}

            <div className="section-title" style={{ marginTop: 18 }}>Suppressed by calibration</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
              Floor-sitting, floor-sleeping and prayer postures are normal in many homes. These are candidates the
              detector declined to raise — the alerts nobody had to see.
            </p>
            {suppressions.length === 0 && (
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>None yet.</p>
            )}
            {suppressions.map((s, i) => (
              <div key={i} className="suppress-row">
                <span className="suppress-rule">{s.rule}</span>
                <span style={{ flex: 1 }}>{s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
