// 塞翁失马 · We'll See — Claude's cut. The screenplay: who says what, in which voice.
// Every line is its own audio clip so questions are spoken as questions and each
// character keeps a distinct voice. `say` (optional) is what the voice reads when
// the spoken rhythm needs different punctuation from the subtitle.
// Start times live in claudeStory.js; they are laid out from the measured clips.

export const VOICES = {
  narrator: { voice: 'en-US-AvaNeural', rate: '-8%', pitch: '+0Hz' },
  grandpa: { voice: 'en-US-AndrewNeural', rate: '-12%', pitch: '-9Hz' },
  dad: { voice: 'en-US-BrianNeural', rate: '-4%', pitch: '+0Hz' },
  mom: { voice: 'en-US-JennyNeural', rate: '-6%', pitch: '+0Hz' },
  mei: { voice: 'en-US-AnaNeural', rate: '-6%', pitch: '-4Hz' },
  bo: { voice: 'en-US-AnaNeural', rate: '+4%', pitch: '+14Hz' },
  neighborA: { voice: 'en-US-RogerNeural', rate: '-2%', pitch: '+0Hz' },
  neighborB: { voice: 'en-US-EmmaNeural', rate: '-2%', pitch: '+0Hz' },
  carpenter: { voice: 'en-US-GuyNeural', rate: '-6%', pitch: '-4Hz' },
};

// `who` is the voice; `face` is the on-screen actor whose lips move (null = voice-over).
export const LINES = [
  // Moving day
  { id: 'open', who: 'narrator', face: null, en: 'In a valley at the foot of the mountains, the Lin family was packing up their whole life.', zh: '在群山脚下的山谷里，林家正在把整个家装上马车。' },
  { id: 'bo-wagon', who: 'bo', face: 'bo', en: "We're going on a wagon! A real wagon!", zh: '我们要坐马车啦！真正的马车！' },
  { id: 'mei-no', who: 'mei', face: 'mei', en: "I don't want to go.", zh: '我不想走。' },
  { id: 'mom-chance', who: 'mom', face: 'mom', en: "Mei, Dad's new job is over the mountains. It's a good chance for us.", zh: '小梅，爸爸的新工作在山那边。这对我们是个好机会。' },
  { id: 'mei-worst', who: 'mei', face: 'mei', en: "It's the worst thing that has ever happened.", zh: '这是有史以来最糟糕的事。' },
  { id: 'gp-worst', who: 'grandpa', face: 'grandpa', en: 'The worst thing? Hmm. Maybe. Maybe not.', say: 'The worst thing? ... Hmm. Maybe. ... Maybe not.', zh: '最糟糕的事？嗯……也许是，也许不是。' },
  { id: 'mei-how', who: 'mei', face: 'mei', en: 'How can it be "maybe not"?', say: 'How can it be, maybe not?', zh: '怎么会“也许不是”呢？' },
  { id: 'gp-story', who: 'grandpa', face: 'grandpa', en: 'Let me tell you about an old man who lived by the frontier, and his horse.', say: 'Let me tell you about an old man who lived by the frontier... and his horse.', zh: '我给你讲个故事：从前边塞住着一位老人，他有一匹马。' },

  // Grandpa's story
  { id: 'p-run', who: 'grandpa', face: null, en: "One morning, the old man's only horse broke through the fence and ran off into the hills.", zh: '一天早上，老人唯一的马冲破篱笆，跑进了深山。' },
  { id: 'n-terrible', who: 'neighborA', face: 'neighborA', en: 'Your only horse! What terrible luck!', zh: '你唯一的马跑了！真倒霉！' },
  { id: 'o-bad1', who: 'grandpa', face: 'elder', en: "Bad luck? Maybe. We'll see.", say: "Bad luck? ... Maybe. We'll see.", zh: '是坏事吗？也许吧。再看看。' },
  { id: 'p-return', who: 'grandpa', face: null, en: 'A few days later, the horse came home, and it brought two wild horses with it.', say: 'A few days later, the horse came home... and it brought two wild horses with it.', zh: '几天后，马回来了，还带回了两匹野马。' },
  { id: 'n-wonderful', who: 'neighborB', face: 'neighborB', en: 'Three horses! What wonderful luck!', zh: '三匹马！真是好运气！' },
  { id: 'o-good1', who: 'grandpa', face: 'elder', en: "Good luck? Maybe. We'll see.", say: "Good luck? ... Maybe. We'll see.", zh: '是好事吗？也许吧。再看看。' },
  { id: 'p-fall', who: 'grandpa', face: null, en: 'His son tried to ride one of the wild horses. He fell, and broke his leg.', zh: '他的儿子去骑野马，摔了下来，摔断了腿。' },
  { id: 'n-poor', who: 'neighborA', face: 'neighborA', en: 'Your poor son! Such bad luck.', zh: '可怜的孩子！真是倒霉。' },
  { id: 'o-bad2', who: 'grandpa', face: 'elder', en: "Bad luck? We'll see.", say: "Bad luck? ... We'll see.", zh: '是坏事吗？再看看。' },
  { id: 'p-war', who: 'grandpa', face: null, en: 'Then war came. Soldiers took every young man from the village, except the boy with the broken leg.', say: 'Then war came. Soldiers took every young man from the village... except the boy with the broken leg.', zh: '后来打仗了，士兵带走了村里所有的年轻人，唯独留下了那个断腿的孩子。' },
  { id: 'n-stays', who: 'neighborB', face: 'neighborB', en: 'Your son gets to stay! What good luck!', zh: '你儿子能留下来！真是好运！' },
  { id: 'o-good2', who: 'grandpa', face: 'elder', en: 'Good luck?', zh: '是好事吗？' },
  { id: 'o-see', who: 'grandpa', face: 'elder', en: "We'll see.", zh: '再看看。' },

  // Back home
  { id: 'mei-which', who: 'mei', face: 'mei', en: 'So was it good luck, or bad luck?', say: 'So... was it good luck? Or bad luck?', zh: '那……到底是好运，还是坏运？' },
  { id: 'gp-over', who: 'grandpa', face: 'grandpa', en: "That's the thing, little one. The story wasn't over yet.", say: "That's the thing, little one. ... The story wasn't over yet.", zh: '这就是关键呀，孩子。故事还没讲完呢。' },
  { id: 'dad-wheel', who: 'dad', face: 'dad', en: 'Oh no. The wheel!', zh: '糟了，车轮！' },
  { id: 'bo-ruined', who: 'bo', face: 'bo', en: "It broke! Now we can't go! Everything's ruined!", zh: '坏掉了！我们走不了了！全完了！' },
  { id: 'mei-remember', who: 'mei', face: 'mei', en: 'Hey. Remember the horse?', say: 'Hey... Remember the horse?', zh: '嘿，还记得那匹马吗？' },
  { id: 'bo-ranaway', who: 'bo', face: 'bo', en: 'The one that ran away?', zh: '跑掉的那匹？' },
  { id: 'mei-see', who: 'mei', face: 'mei', en: "Bad luck? Maybe. We'll see.", say: "Bad luck? ... Maybe. ... We'll see.", zh: '是坏事吗？也许吧。我们再看看。' },
  { id: 'bo-see', who: 'bo', face: 'bo', en: "We'll see?", zh: '再看看？' },

  // The workshop
  { id: 'n-workshop', who: 'narrator', face: null, en: 'So Dad rolled the broken wheel down to the village workshop.', zh: '于是，爸爸把坏掉的车轮推到了村里的工坊。' },
  { id: 'c-fix', who: 'carpenter', face: 'carpenter', en: 'I can fix this by tomorrow. Did you build that wagon yourself?', zh: '明天就能修好。那辆马车是你自己做的？' },
  { id: 'dad-every', who: 'dad', face: 'dad', en: 'Every board of it.', zh: '每一块木板都是。' },
  { id: 'c-stay', who: 'carpenter', face: 'carpenter', en: "Then why leave? I have more work than hands. Stay, and work with me.", say: 'Then why leave? I have more work than hands. ... Stay, and work with me.', zh: '那何必走呢？我这儿活多人少。留下来，跟我一起干吧。' },

  // Evening
  { id: 'n-evening', who: 'narrator', face: null, en: 'That evening, the family talked for a long time.', zh: '那天傍晚，一家人商量了很久。' },
  { id: 'dad-stay', who: 'dad', face: 'dad', en: "We'll stay. For now.", say: "We'll stay. ... For now.", zh: '我们留下来。至少现在。' },
  { id: 'bo-good', who: 'bo', face: 'bo', en: 'Is that good luck?', zh: '这算是好运吗？' },
  { id: 'mei-final', who: 'mei', face: 'mei', en: "We'll see.", zh: '再看看。' },
  { id: 'close', who: 'narrator', face: null, en: 'Good luck, or bad luck? Give the story time.', say: 'Good luck... or bad luck? ... Give the story time.', zh: '是福是祸？给故事一点时间。' },
];
