const base = import.meta.env?.BASE_URL ?? '/';
export const movieAsset = name => `${base}movies/${name}`;

// The quality bar both films were held to; each prompt ends with it.
const QUALITY = `Make it feel like a polished animated short, not a slideshow:
- Give every character a distinct neural voice, one clip per line. Questions must rise like real questions, and voices are never sped up to fit.
- Faces must act: brows, eyes and mouths that change with the drama, blinking, and lips that move with the voice.
- Characters always face where they walk, never clip through each other or the set, and use their whole body: bending, kneeling, sitting, carrying.
- Build the sets from Blockyland's own blocks and textures. Paths sit flush with the ground, and buildings suit who lives in them.
- Use real camera grammar (wide shots, singles that respect the 180° rule, close-ups on reactions) and dissolves for jumps in time.
- Write an original pentatonic score that follows the story's turns and dips under dialogue, plus sound effects for footsteps, impacts and ambience.
- Add Chinese and English subtitles, a title card and an end card with the moral.
Follow src/cinema/CINEMA_GUIDELINES.md. Render at 1280×720 and 24 fps, review every shot and fix what looks wrong, then add the film to the Movies page.`;

export const MOVIES = Object.freeze([
  { id: 'stump-claude', title: '守株待兔', english: 'Waiting by the Stump', duration: 127,
    description: 'One lucky rabbit. One very bad plan. A farmer waits a whole season by a stump while his neighbour’s wheat turns gold.',
    theme: 'Luck & effort', poster: movieAsset('stump-claude.jpg'), youtube: 'mk7O2zUk1_c',
    preview: `${base}stump-claude.html`, note: 'The traditional fable, fully voiced: a hard-working farmer, a neighbour and her grandson, and a season of waiting.',
    prompt: `Make a two-minute short film of the Chinese fable 守株待兔 (Waiting by the Stump) inside Blockyland, using the game's own blocks and character models.

Story: A hard-working farmer hoes his field from sunrise to sunset. His neighbour, Auntie Li, and her young grandson Hu farm the next field, and Li teases him about his straight rows. One day a rabbit races out of the woods and knocks itself out on a tree stump (keep it non-graphic). The farmer can't believe his luck: rabbit stew, and he didn't lift a finger. He decides he never needs to work again, drops his hoe in the field and sits down by the stump to wait.

Show the neighbours' disbelief ("Grandma, what is he doing?" "Waiting for rabbits." "Really?"). Then show a whole season passing as a time-lapse. Weeds swallow his field while Li's wheat turns gold, and the one rabbit that does come runs off before he can move.

At harvest, Hu asks if any more rabbits came. "Not one." Li kindly gives him seeds for spring: a field waits for you, if you work it. He walks back to the hoe he dropped and starts clearing weeds as the sun sets. End on the moral: 偶然的好运，不能代替辛勤的劳动 (a lucky chance is no substitute for honest work).

${QUALITY}` },
  { id: 'well-see-claude', title: '塞翁失马', english: 'We’ll See', duration: 178,
    description: 'Moving day. Grandpa tells the story of the frontier horse, a wagon wheel breaks, and Mei has to decide what kind of big sister she is.',
    theme: 'Change & possibility', poster: movieAsset('well-see-claude.jpg'), youtube: 'D7qG6BPl-jI',
    preview: `${base}well-see-claude.html`, note: 'An old parable inside a family story: a cast of distinct voices, expressive faces, and an ending at the village workshop.',
    prompt: `Make a three-minute short film of 塞翁失马 (We'll See) inside Blockyland, using the game's own blocks and character models.

Story: It's moving day. Dad has found work beyond the mountains, and ten-year-old Mei refuses to help pack ("It's the worst thing that has ever happened"). Her excited little brother Bo can't wait to ride the wagon. Grandpa sits beside her on the porch steps: "The worst thing? Maybe. Maybe not." Then he tells the parable of the old man at the frontier.

Stage the parable as a warm sepia storybook on its own set, with a hut, a corral and the frontier wall, and play all four turns. The old man's only horse runs away. It comes back with two wild horses. His son breaks his leg riding one. When soldiers take the village's young men, the son is spared. Each time the neighbours cry "What luck!" and the old man answers "Good luck? Bad luck? We'll see."

Back home, as Dad lifts the last trunk, a wagon wheel snaps. That's bad luck for Bo, who bursts into tears, and secretly good luck for Mei. She chooses to kneel beside him and pass on Grandpa's words: "Remember the horse? Bad luck? Maybe. We'll see." The broken wheel takes Dad to the village wheelwright, who admires the wagon he built and offers him work.

That evening the family decides to stay, for now. Bo asks, "Is that good luck?" Mei glances at Grandpa: "We'll see." Grandpa winks. End on the moral: 塞翁失马，焉知非福 (the old man lost his horse; who could say it wasn't a blessing?).

${QUALITY}` },
  { id: 'volume-layers', title: '一层一层数体积', english: 'Count Volume Layer by Layer', duration: 338,
    description: 'How many buckets fill a giant glass fish ball? Mei shows Bo with blocks: count every shape layer by layer, from a staircase to a pyramid, a ball and even a heart.',
    theme: 'Math & discovery', poster: movieAsset('volume-layers.jpg'), youtube: 'tuoBzEWgPTI',
    preview: `${base}volume-layers.html`, note: 'A math lesson for ages 9 to 14: the triangle, pyramid, cone and sphere formulas, each found by counting layers of blocks.',
    prompt: `Make a short film inside Blockyland, using the game's own blocks and character models, that teaches elementary and middle school students where the volume formulas come from by counting blocks layer by layer. Make it intuitive, fun and easy to follow. Title it 一层一层数体积 · Count Volume Layer by Layer.

Story: Bo has built a giant glass fish ball and asks his big sister Mei how many buckets of water it will take to fill it. Mei says they can count it layer by layer, but should start with simpler shapes.

Start flat. A staircase N blocks wide and N high has 1 + 2 + … + N blocks; a flipped copy slides in to make an N × (N+1) rectangle, so the sum is N(N+1)/2. As the blocks get smaller the staircase becomes a triangle and the extra ½N fades away, which is exactly A = ½·B·H.

Then go 3D. Build a stepped pyramid N blocks high whose layers are 2N × 2N, 2(N−1) × 2(N−1), … down to 2 × 2. Six of these fill a 2N × 2N × 2N cube, so 6·Σ(2k)² ≈ (2N)³ and Σk² ≈ ⅓N³. Be honest that the block version overlaps: show the shared seam blocks in gold, shrink the blocks to show the seams thinning to nothing, and then show the limit with smooth pyramids that fit the cube exactly, so V = ⅓·S·H. Draw the analogy with two triangles making a square.

Next the ball: a half ball is a stack of circles whose radius squared at height k is R² − k², so its volume is Σπ(R² − k²) = π(R³ − ⅓R³) = ⅔πR³ (show Archimedes' cylinder-minus-cone with the same layers), and a whole ball is ⁴⁄₃πR³. Answer Bo: about 905 buckets for a radius of 6, and fill the ball layer by layer.

Finally show that every pointy shape follows ⅓·S·H: a cone, a tetrahedron, even a heart-shaped pyramid. Explain clearly why each layer is S·(k/H)²: the sides are straight lines from the point, so a layer k steps down is k/H as wide and k/H as deep. End at sunset by the full fish ball with all the formulas.

${QUALITY}` },
]);
