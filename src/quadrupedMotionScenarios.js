import { quadrupedMode, quadrupedLegs, quadrupedSpecialPose } from './quadrupedMotion.js';

function resetNeutral(s) {
  s.player.position.set(100, 0, 100); s.player.gamemode = 'spectator';
  Object.assign(s.mob, { isHostile: false, isSitting: false, isSleeping: false, isMauling: false,
    isRolling: false, isLyingDown: false, isThundering: false, sneezeTimer: 0, pouncePhase: null,
    ramState: null, pendingSpitTarget: null, spitCharge: 0, grazeTime: 0, rearTime: 0, rollState: 'idle',
    // Isolate ordinary walking from randomly assigned panda roll/lie personalities.
    isLazy: false, isPlayful: false, isWorried: false });
  s.manager.random = () => 0.5;
}
export function quadrupedMotionScenarios(type) {
  const mode = quadrupedMode(type);
  if (!mode || type === 'polar_bear') return []; // Polar bear already has equivalent dedicated cases.
  const cases = [{
    id: 'quadruped_idle_head', label: 'Curious head turns while standing (species poses preserved)', duration: 7,
    setup(s) { resetNeutral(s); s.headMin = Infinity; s.headMax = -Infinity; s.headSamples = 0; },
    update(s) {
      s.mob.wanderGoal = null; s.mob.wanderTimer = 100;
      s.mob.velocity.x = s.mob.velocity.z = 0;
      if (!s.mob.head || quadrupedSpecialPose(s.mob)) return;
      s.headMin = Math.min(s.headMin, s.mob.head.rotation.y);
      s.headMax = Math.max(s.headMax, s.mob.head.rotation.y); s.headSamples++;
    },
    check(s) {
      s.checkDetail = `${s.headSamples} grounded head samples; sweep ${(s.headMax - s.headMin).toFixed(2)} rad`;
      return s.headSamples > 20 && s.headMax - s.headMin > (mode === 'crawl' ? 0.12 : 0.18);
    }
  }];
  if (mode !== 'hop') cases.unshift({
    id: 'quadruped_diagonal_walk', label: mode === 'crawl' ? 'Grounded crawling with alternating diagonal limbs' : 'Natural walk with opposite front legs and diagonal pairs', duration: 5,
    setup(s) {
      resetNeutral(s); s.walkSamples = 0; s.walkSigns = new Set(); s.walkMismatch = false;
      s.mob.wanderGoal = s.mob.mesh.position.clone(); s.mob.wanderGoal.z += 20; s.mob.wanderTimer = 100;
    },
    update(s) {
      const legs = quadrupedLegs(s.mob);
      if (legs.length !== 4 || quadrupedSpecialPose(s.mob) || s.mob.inWater || s.mob.onGround === false) return;
      const normalized = legs.map(l => l.mesh.rotation.x * l.side * (l.front ? 1 : -1));
      if (Math.abs(normalized[0]) < 0.07) return;
      s.walkSamples++; s.walkSigns.add(Math.sign(normalized[0]));
      s.walkMismatch ||= normalized.some(v => Math.abs(v - normalized[0]) > 1e-6);
    },
    check(s) {
      s.checkDetail = `${s.walkSamples} stride samples; ${s.walkSigns.size} directions; diagonal mismatch=${s.walkMismatch}`;
      return s.walkSamples > 20 && s.walkSigns.size === 2 && !s.walkMismatch;
    }
  });
  return cases;
}
