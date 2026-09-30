# Arrows and bow aiming

Hold right mouse with a bow to draw; release to shoot. A full draw takes one second, smoothly narrows the normal 70-degree view to 59.5 degrees, and launches the strongest shot. Survival requires an arrow in the hotbar or inventory and consumes one on firing. Creative needs no ammunition. Switching items, losing pointer lock, opening a menu, dying, or leaving the window cancels the draw without firing.

Skeleton, pillager, and player arrows share a visible shaft, arrowhead, feathers, gravity-driven orientation and short trajectory trail. Collision is sampled along the flight segment to prevent fast arrows passing through thin walls. Missed arrows remain embedded in terrain for 60 seconds, briefly wobble on impact, and fall if their supporting block is removed. Survival player arrows can be recovered; hostile arrows cannot. Entity hits apply damage once. World changes clear arrows; at most 256 are retained, with geometry and materials disposed on removal.

Minecraft arrows stick into blocks rather than breaking into loose fragments; the implementation follows that behavior. The trajectory trail is a readability enhancement. Crossbow loading, enchantments, and tipped arrows are outside this change.

References: https://minecraft.wiki/w/Arrow and https://minecraft.fandom.com/wiki/Bow

Run npm test and open /tests/arrow-effects.html on the development server for the visual fixture.
