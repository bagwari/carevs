// Rolling buffer of downscaled JPEG snapshots.
// Only frames around a suspected event are ever persisted — the buffer itself
// lives in memory and is continuously overwritten, so there is no recording.

const FRAME_WIDTH = 320;
const JPEG_QUALITY = 0.6;

export class FrameBuffer {
  constructor(capacity = 24) {
    this.capacity = capacity;
    this.frames = [];
    this.canvas = document.createElement('canvas');
  }

  capture(video, label = 'frame') {
    if (!video?.videoWidth) return null;
    const scale = FRAME_WIDTH / video.videoWidth;
    this.canvas.width = FRAME_WIDTH;
    this.canvas.height = Math.round(video.videoHeight * scale);
    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = {
      dataUrl: this.canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      label,
      t: performance.now(),
    };
    this.frames.push(frame);
    if (this.frames.length > this.capacity) this.frames.shift();
    return frame;
  }

  // Frames spanning the moments before and at the event.
  keyframesAround(count = 3) {
    if (!this.frames.length) return [];
    const picks = [];
    const step = Math.max(1, Math.floor(this.frames.length / count));
    for (let i = 0; i < this.frames.length && picks.length < count; i += step) {
      picks.push(this.frames[i]);
    }
    const last = this.frames[this.frames.length - 1];
    if (picks[picks.length - 1] !== last) picks.push(last);
    return picks.map((f, i) => ({
      dataUrl: f.dataUrl,
      label: i === picks.length - 1 ? 'at detection' : `-${((last.t - f.t) / 1000).toFixed(1)}s`,
    }));
  }

  clear() {
    this.frames = [];
  }
}
