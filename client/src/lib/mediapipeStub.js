// The pose-detection package statically imports @mediapipe/pose for its
// BlazePose MediaPipe runtime. This POC only uses the MoveNet/tfjs runtime,
// so that code path never executes — this stub satisfies the import.
export class Pose {}
export const POSE_CONNECTIONS = [];
export default { Pose, POSE_CONNECTIONS };
