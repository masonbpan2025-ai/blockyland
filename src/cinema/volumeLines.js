// 一层一层数体积 · Count Volume Layer by Layer. The screenplay: who says what, in which voice.
// One clip per line; `say` is the spoken text when the rhythm needs different punctuation.
// Start times live in volumeStory.js, laid out from the measured clips.
// Mei and Bo keep their voices from 塞翁失马 · We'll See.

export const VOICES = {
  narrator: { voice: 'en-US-AvaNeural', rate: '-8%', pitch: '+0Hz' },
  mei: { voice: 'en-US-AnaNeural', rate: '-6%', pitch: '-4Hz' },
  bo: { voice: 'en-US-AnaNeural', rate: '+4%', pitch: '+14Hz' },
};

// `face` is the on-screen actor whose lips move (null = voice-over).
export const LINES = [
  // the fish ball
  { id: 'n-open', who: 'narrator', face: null, en: 'One sunny morning, Bo finished his biggest build ever.', zh: '一个晴朗的早晨，小波完成了他最大的作品。' },
  { id: 'bo-ball', who: 'bo', face: 'bo', en: 'Mei, look! A giant fish ball for my fish!', zh: '姐姐快看！给我的小鱼住的大鱼球！' },
  { id: 'bo-buckets', who: 'bo', face: 'bo', en: 'How many buckets will it take to fill it?', zh: '要多少桶水才能装满它呢？' },
  { id: 'mei-hmm', who: 'mei', face: 'mei', en: 'Hmm. Let’s count it, layer by layer.', say: 'Hmm... Let’s count it, layer by layer.', zh: '嗯……我们一层一层地数。' },
  { id: 'bo-round', who: 'bo', face: 'bo', en: 'Layers? But it’s round!', zh: '一层一层？可它是圆的呀！' },
  { id: 'mei-simple', who: 'mei', face: 'mei', en: 'Round is tricky. So first, let’s start with something simpler.', say: 'Round is tricky. So first... let’s start with something simpler.', zh: '圆的比较难。所以，我们先从简单的形状开始。' },
  // flat first: the staircase
  { id: 'mei-stairs', who: 'mei', face: 'mei', en: 'Flat shapes first. A staircase, six blocks wide and six blocks high.', say: 'Flat shapes first. A staircase... six blocks wide, and six blocks high.', zh: '先数平面的：一个楼梯，6 格宽，6 格高。' },
  { id: 'bo-count', who: 'bo', face: 'bo', en: 'One, plus two, plus three, plus four, plus five, plus six. Twenty-one!', say: 'One... plus two... plus three... plus four... plus five... plus six. Twenty-one!', zh: '1 加 2 加 3 加 4 加 5 加 6……21！' },
  { id: 'mei-hundred', who: 'mei', face: 'mei', en: 'Good! But what if it were a hundred steps high?', zh: '很好！那如果有一百级台阶呢？' },
  { id: 'bo-forever', who: 'bo', face: 'bo', en: 'That would take forever!', zh: '那要数到什么时候啊！' },
  { id: 'mei-twin', who: 'mei', face: 'mei', en: 'Watch. Make a copy, flip it over, and slide it in.', say: 'Watch. Make a copy... flip it over... and slide it in.', zh: '看好了：复制一个，翻过来，推进去。' },
  { id: 'bo-rect', who: 'bo', face: 'bo', en: 'Whoa, a rectangle!', zh: '哇，变成长方形了！' },
  { id: 'mei-rect', who: 'mei', face: 'mei', en: 'Six high and seven wide is forty-two. Our staircase is half of it: twenty-one.', say: 'Six high, and seven wide, is forty-two. Our staircase is half of it... twenty-one.', zh: '6 高 7 宽，一共 42。楼梯正好是它的一半：21。' },
  { id: 'n-formula', who: 'narrator', face: null, en: 'For any staircase, one plus two, all the way up to N, is N times N plus one, divided by two.', say: 'For any staircase, one plus two, all the way up to N, is N, times N plus one, divided by two.', zh: '任何楼梯都一样：1 加 2 一直加到 N，等于 N 乘 (N+1) 再除以 2。' },
  { id: 'mei-tiny', who: 'mei', face: 'mei', en: 'Now let’s make the blocks smaller, and smaller, and smaller.', say: 'Now let’s make the blocks smaller... and smaller... and smaller.', zh: '现在把方块变小，再变小，再变小。' },
  { id: 'bo-triangle', who: 'bo', face: 'bo', en: 'The steps are disappearing. It’s turning into a triangle!', zh: '台阶不见了，变成三角形了！' },
  { id: 'n-half', who: 'narrator', face: null, en: 'With tiny blocks, the extra bit fades away. What’s left is the triangle’s area: one half, times base, times height.', say: 'With tiny blocks, the extra bit fades away. What’s left is the triangle’s area... one half, times base, times height.', zh: '方块越小，多出来的部分就消失了。剩下的就是三角形的面积：½ × 底 × 高。' },
  // the pyramid
  { id: 'mei-3d', who: 'mei', face: 'mei', en: 'Now the same idea in 3D. A pyramid!', zh: '现在把同样的方法用到三维：金字塔！' },
  { id: 'n-squares', who: 'narrator', face: null, en: 'Every layer is a square: eight by eight, six by six, four by four, and two by two.', say: 'Every layer is a square. Eight by eight... six by six... four by four... and two by two.', zh: '每一层都是正方形：8×8，6×6，4×4，还有 2×2。' },
  { id: 'bo-120', who: 'bo', face: 'bo', en: 'Sixty-four, thirty-six, sixteen, four. That’s a hundred and twenty!', say: 'Sixty-four... thirty-six... sixteen... four. That’s a hundred and twenty!', zh: '64、36、16、4……一共 120！' },
  { id: 'mei-quarters', who: 'mei', face: 'mei', en: 'And every layer splits into four equal little squares.', zh: '而且每一层都能分成四个一样的小正方形。' },
  { id: 'bo-harder', who: 'bo', face: 'bo', en: 'But bigger pyramids are so much harder to add up!', zh: '可是金字塔越大，加起来就越难！' },
  { id: 'mei-trick', who: 'mei', face: 'mei', en: 'Then here’s a trick. Make six of them.', say: 'Then here’s a trick. Make six of them.', zh: '那我教你一招：做六个。' },
  { id: 'n-fly', who: 'narrator', face: null, en: 'Six identical pyramids, points facing in...', say: 'Six identical pyramids... points facing in...', zh: '六个一样的金字塔，尖尖朝里……' },
  { id: 'bo-cube', who: 'bo', face: 'bo', en: 'They make a cube!', zh: '拼成了一个立方体！' },
  { id: 'mei-gold', who: 'mei', face: 'mei', en: 'Almost. See the gold blocks on the seams? Two pyramids share each one, so they get counted twice.', say: 'Almost. See the gold blocks on the seams? Two pyramids share each one... so they get counted twice.', zh: '差一点。看到接缝上金色的方块了吗？两个金字塔共用它们，所以被算了两次。' },
  { id: 'mei-smaller', who: 'mei', face: 'mei', en: 'But watch what happens when the blocks get smaller.', zh: '不过，看看方块变小以后会怎样。' },
  { id: 'n-seams', who: 'narrator', face: null, en: 'The smaller the blocks, the thinner the seams, and the extra shrinks toward zero.', say: 'The smaller the blocks, the thinner the seams... and the extra shrinks, toward zero.', zh: '方块越小，接缝越薄，多算的部分越来越接近零。' },
  { id: 'n-limit', who: 'narrator', face: null, en: 'With infinitely small blocks, six pyramids fit the cube exactly, just like two triangles make a square.', say: 'With infinitely small blocks, six pyramids fit the cube exactly... just like two triangles make a square.', zh: '方块无限小时，六个金字塔正好拼成立方体，就像两个三角形拼成正方形。' },
  { id: 'mei-third', who: 'mei', face: 'mei', en: 'So one pyramid is a sixth of the cube. That’s one third, times the base, times the height!', say: 'So one pyramid is a sixth of the cube. That’s one third... times the base... times the height!', zh: '所以一个金字塔是立方体的六分之一，也就是 ⅓ × 底面积 × 高！' },
  { id: 'n-sum', who: 'narrator', face: null, en: 'And it gives us a shortcut: add up every k squared, and you get one third of N cubed.', say: 'And it gives us a shortcut. Add up every k squared... and you get one third of N cubed.', zh: '还能得到一个捷径：把所有的 k² 加起来，等于 N³ 的三分之一。' },
  // the ball
  { id: 'bo-ballnow', who: 'bo', face: 'bo', en: 'Can we do my fish ball now?', zh: '现在可以算我的鱼球了吗？' },
  { id: 'mei-circles', who: 'mei', face: 'mei', en: 'Yes! Half a ball is just a stack of circles.', zh: '可以！半个球就是一摞圆片。' },
  { id: 'n-radius', who: 'narrator', face: null, en: 'At height k, the circle’s radius squared is R squared minus k squared.', say: 'At height k, the circle’s radius squared... is R squared, minus k squared.', zh: '在高度 k 处，圆的半径平方是 R² − k²。' },
  { id: 'mei-area', who: 'mei', face: 'mei', en: 'So every layer has an area of pi, times R squared minus k squared.', say: 'So every layer has an area of pi... times R squared minus k squared.', zh: '所以每一层的面积是 π × (R² − k²)。' },
  { id: 'n-archimedes', who: 'narrator', face: null, en: 'A cylinder with a cone taken out has exactly the same layers. Archimedes found this over two thousand years ago.', say: 'A cylinder with a cone taken out has exactly the same layers. Archimedes found this... over two thousand years ago.', zh: '把圆柱挖掉一个圆锥，每一层都和半球一模一样。这是阿基米德两千多年前的发现。' },
  { id: 'mei-add', who: 'mei', face: 'mei', en: 'Add up the layers with our shortcut: pi R cubed, minus a third of pi R cubed.', say: 'Add up the layers with our shortcut. Pi R cubed... minus a third of pi R cubed.', zh: '用我们的捷径把每一层加起来：πR³ 减去 πR³ 的三分之一。' },
  { id: 'n-twothirds', who: 'narrator', face: null, en: 'That’s two thirds pi R cubed, for half a ball.', zh: '半个球就是 ⅔πR³。' },
  { id: 'bo-halves', who: 'bo', face: 'bo', en: 'And two halves make a whole ball!', zh: '两个半球合起来就是一个整球！' },
  { id: 'mei-ball', who: 'mei', face: 'mei', en: 'Four thirds, times pi, times R cubed.', say: 'Four thirds... times pi... times R cubed.', zh: '⁴⁄₃ × π × R³。' },
  { id: 'bo-six', who: 'bo', face: 'bo', en: 'My ball’s radius is six blocks. So...', zh: '我的球半径是 6 格，所以……' },
  { id: 'mei-905', who: 'mei', face: 'mei', en: 'About nine hundred and five buckets.', zh: '大约 905 桶水。' },
  { id: 'bo-905', who: 'bo', face: 'bo', en: 'Nine hundred and five buckets?', zh: '905 桶？' },
  { id: 'n-fill', who: 'narrator', face: null, en: 'So they filled it, one bucket, and one layer, at a time.', say: 'So they filled it... one bucket, and one layer, at a time.', zh: '于是他们一桶一桶、一层一层地把它装满了。' },
  // every pointy shape
  { id: 'bo-heart', who: 'bo', face: 'bo', en: 'Mei, does it work for other shapes? A cone? A heart?', zh: '姐姐，别的形状也行吗？圆锥？爱心？' },
  { id: 'mei-every', who: 'mei', face: 'mei', en: 'Every pointy shape follows the same rule. Let me show you why.', zh: '所有尖顶的形状都遵守同一个规则。我来告诉你为什么。' },
  { id: 'mei-side', who: 'mei', face: 'mei', en: 'From the side, a pyramid is our triangle again. Its sides are straight lines from the point.', say: 'From the side, a pyramid is our triangle again. Its sides are straight lines... from the point.', zh: '从侧面看，金字塔又是那个三角形：它的边是从尖顶出发的直线。' },
  { id: 'n-width', who: 'narrator', face: null, en: 'So k steps down from the point, a layer is k over H as wide as the base.', say: 'So k steps down from the point... a layer is k over H, as wide as the base.', zh: '所以从尖顶往下走 k 格，这一层的宽度就是底边的 k/H。' },
  { id: 'mei-depth', who: 'mei', face: 'mei', en: 'And it shrinks the same way in depth, too.', zh: '而且前后的深度也按同样的比例缩小。' },
  { id: 'n-quarter', who: 'narrator', face: null, en: 'Half as wide and half as deep covers only a quarter. So every layer is S, times k over H, squared.', say: 'Half as wide, and half as deep, covers only a quarter. So every layer is S... times k over H, squared.', zh: '宽减半、深也减半，面积只剩四分之一。所以每一层都是 S × (k/H)²。' },
  { id: 'bo-myheart', who: 'bo', face: 'bo', en: 'Even for my heart? Really?', zh: '我的爱心也行？真的吗？' },
  { id: 'mei-heart', who: 'mei', face: 'mei', en: 'Even for your heart. Half the size each way, a quarter of the area.', say: 'Even for your heart. Half the size each way... a quarter of the area.', zh: '你的爱心也是：每个方向缩小一半，面积就是四分之一。' },
  { id: 'n-sumall', who: 'narrator', face: null, en: 'Add up every layer with the shortcut, and every pointy shape has volume one third, times base area, times height.', say: 'Add up every layer with the shortcut... and every pointy shape has volume one third, times base area, times height.', zh: '用捷径把每一层加起来：所有尖顶形状的体积都是 ⅓ × 底面积 × 高。' },
  // ending
  { id: 'bo-fish', who: 'bo', face: 'bo', en: 'Look, Mei! The fish love it!', zh: '姐姐你看！小鱼好喜欢！' },
  { id: 'n-close', who: 'narrator', face: null, en: 'Triangles, pyramids, cones and balls. Count them, layer by layer.', say: 'Triangles, pyramids, cones, and balls. Count them... layer by layer.', zh: '三角形、金字塔、圆锥和球——一层一层地数。' },
];
