# Polar bear gait and idle motion

The spawner lists legs as front left, front right, back left, back right. Walking now pairs front left with back right and front right with back left, with opposing pairs exactly half a cycle apart. Previously successive legs differed by only 0.4 radians, making them paddle almost together.

Horizontal speed drives stride cadence and amplitude. Legs ease back to a planted stance after stopping; vertical velocity alone cannot start a walk. A neutral bear gently scans sideways and nods with its head independently of its body, with less scanning while walking. The existing rearing maul overrides the walk.

Mob Inspector now offers two explicit cases: **Walking: opposite front legs and synchronized diagonal pairs**, and **Standing: curious head turns with planted feet**. The first samples both stride directions through real movement; the second observes head rotation while ensuring feet and horizontal position remain stationary.

Validation: `node --test --test-isolation=none tests/polarBearMotion.test.js tests/polarBearParity.test.js tests/mobShowcase.test.js` passed all 55 tests. This includes adult/cub diagonal phases, settling, head limits, speed-dependent cadence, vertical-only motion, rearing, and both Inspector scenarios. The existing cross-mob Showcase regression also completed without scenario crashes.

A visual browser check was attempted on 14 October 2026, but Computer Use stopped because it could not verify Chrome's current URL. The Inspector simulation checks passed; the visual browser check remains unverified. No texture or image assets were generated.
