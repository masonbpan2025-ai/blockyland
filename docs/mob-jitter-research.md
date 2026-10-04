// How PrismarineJS avoids mob jitter at corners, for the record.
//
// Read from mineflayer-pathfinder (master):
//
//   lib/physics.js
//     getReached(path) => {
//       const delta = path[0].minus(state.pos)
//       return Math.abs(delta.x) <= 0.35 && Math.abs(delta.z) <= 0.35 && Math.abs(delta.y) < 1
//     }
//
//     getController(nextPoint, jump, sprint, jumpAfter = 0) {
//       return (state, tick) => {
//         const dx = nextPoint.x - state.pos.x
//         const dz = nextPoint.z - state.pos.z
//         state.yaw = Math.atan2(-dx, -dz)   // straight at the waypoint, every tick
//         state.control.forward = true
//         ...
//       }
//     }
//
//   lib/goto.js drives a goal to completion through events; library.js calls
//   `bot.look(bot.entity.yaw, 0, true)` in a loop and only advances the waypoint when
//   getReached() says so.
//
// Three properties matter, and my steerGround has none of them:
//
//   1. The heading is a PURE FUNCTION OF THE AIM POINT -- `atan2` straight at the next waypoint.
//      There is no probe, no "is this angle clear", no alternative-angle search. Therefore the
//      yaw cannot flip between frames unless the aim point changes, and the aim point only
//      changes when a waypoint is reached.
//
//   2. Arrival is a TOLERANCE, not a point. 0.35 blocks in X and Z, and under 1 block in Y. The
//      mob is considered "there" while still well inside the cell, so the next waypoint is
//      adopted early and the mob never presses into the corner trying to reach an exact spot.
//
//   3. Obstacle avoidance is the PATHFINDER's job, not the steering's. Steering never makes a
//      local avoidance decision, so there is nothing to oscillate.
//
// My steerGround does the opposite of (1): every frame it probes `clear(yaw)`, and if that fails
// it scans [0.65, -0.65, 1.2, -1.2, PI/2, -PI/2, PI] in order. The probe thresholds on
// `Math.floor(position + sin(angle) * reach)`, so tiny position changes near a corner flip the
// result, and the first alternative that clears *flips between the +0.65 and -0.65 side* as the
// mob nudges. That is the jitter: the mob alternates left/right around the corner every frame.
//
// The fix is to adopt (1) and (2): commit to the heading and hold it, adopt a waypoint on a
// tolerance, and stop making per-frame avoidance decisions in the steering layer.
export const PRISMARINE_FINDINGS = {
  source: 'https://github.com/PrismarineJS/mineflayer-pathfinder (lib/physics.js)',
  heading: 'atan2 straight at the next waypoint, recomputed from the aim point only',
  arrivalTolerance: { x: 0.35, z: 0.35, y: 1 },
  avoidance: 'pathfinder, not steering',
};
