// Exercise the real Inspector update path, not a synthetic pose applied to a frozen mob.
export function polarBearMotionScenarios() {
  return [
    {
      id: 'polar_bear_diagonal_walk', label: 'Walking: opposite front legs and synchronized diagonal pairs', duration: 4,
      setup(s) {
        s.player.position.set(100, 0, 100);
        s.mob.wanderGoal = s.mob.mesh.position.clone(); s.mob.wanderGoal.z += 30;
        s.mob.wanderTimer = 100;
        s.polarWalkSamples = 0; s.polarWalkMismatch = false; s.polarStrideSigns = new Set();
      },
      update(s) {
        const [fl, fr, bl, br] = s.mob.legs.map(l => l.rotation.x);
        if (Math.abs(fl) < 0.08) return;
        s.polarWalkSamples++;
        s.polarStrideSigns.add(Math.sign(fl));
        s.polarWalkMismatch ||= Math.abs(fl + fr) > 1e-6 || Math.abs(bl + br) > 1e-6 || Math.abs(fl - br) > 1e-6 || Math.abs(fr - bl) > 1e-6;
      },
      check(s) {
        s.checkDetail = `${s.polarWalkSamples} gait samples, ${s.polarStrideSigns.size} stride directions`;
        return s.mob.mesh.position.distanceTo(s.startPosition) > 1 && s.polarWalkSamples > 20 && s.polarStrideSigns.size === 2 && !s.polarWalkMismatch;
      }
    },
    {
      id: 'polar_bear_idle_look', label: 'Standing: curious head turns with planted feet', duration: 6,
      setup(s) {
        s.player.position.set(100, 0, 100);
        s.polarHeadMin = Infinity; s.polarHeadMax = -Infinity; s.polarIdleLegMax = 0;
      },
      update(s) {
        s.mob.wanderGoal = null; s.mob.wanderTimer = 100; s.mob.velocity.x = s.mob.velocity.z = 0;
        s.polarHeadMin = Math.min(s.polarHeadMin, s.mob.head.rotation.y);
        s.polarHeadMax = Math.max(s.polarHeadMax, s.mob.head.rotation.y);
        s.polarIdleLegMax = Math.max(s.polarIdleLegMax, ...s.mob.legs.map(l => Math.abs(l.rotation.x)));
      },
      check(s) {
        s.checkDetail = `head sweep ${(s.polarHeadMax - s.polarHeadMin).toFixed(2)} rad; leg swing ${s.polarIdleLegMax.toFixed(3)}`;
        return s.polarHeadMax - s.polarHeadMin > 0.35 && s.polarIdleLegMax < 0.01 && Math.hypot(s.mob.mesh.position.x - s.startPosition.x, s.mob.mesh.position.z - s.startPosition.z) < 0.01;
      }
    }
  ];
}
