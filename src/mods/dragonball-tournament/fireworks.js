import * as THREE from 'three';
export const fireworks = {
  launchTournamentFireworks(centerPos = new THREE.Vector3(0, 24, 0), count = 6) {
    const arenaColors = [
      [0xff0044, 0xffd700, 0xffffff],
      [0x00ffff, 0x3b82f6, 0x60a5fa],
      [0xa855f7, 0xec4899, 0xf43f5e],
      [0x22c55e, 0x10b981, 0xfacc15],
      [0xf97316, 0xeab308, 0xffffff]
    ];

    for (let i = 0; i < count; i++) {
      this.modSchedule(() => {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 22,
          0,
          (Math.random() - 0.5) * 22
        );
        const startPos = centerPos.clone().add(offset);
        const burstHeight = startPos.y + 24 + Math.random() * 16;
        const colorSet = arenaColors[Math.floor(Math.random() * arenaColors.length)];
        this.spawnFireworkRocket(startPos, burstHeight, colorSet);
      }, i * 220 + Math.random() * 100);
    }
  }
};
