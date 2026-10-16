// 守株待兔 · Waiting by the Stump — Claude. The screenplay: who says what, in which voice.
// One clip per line; `say` is the spoken text when the rhythm needs different punctuation.
// Start times live in stumpStory.js, laid out from the measured clips.

export const VOICES = {
  narrator: { voice: 'en-US-AvaNeural', rate: '-8%', pitch: '+0Hz' },
  farmer: { voice: 'en-US-GuyNeural', rate: '-4%', pitch: '-2Hz' },
  li: { voice: 'en-US-JennyNeural', rate: '-10%', pitch: '-7Hz' },
  hu: { voice: 'en-US-AnaNeural', rate: '+0%', pitch: '+8Hz' },
};

// `face` is the on-screen actor whose lips move (null = voice-over).
export const LINES = [
  { id: 'open', who: 'narrator', face: null, en: 'Long ago, in the state of Song, there lived a farmer who worked his field from sunrise to sunset.', zh: '很久以前，宋国有个农夫，每天从日出忙到日落。' },
  { id: 'li-morning', who: 'li', face: 'li', en: 'Morning, neighbor! Your rows are straighter than mine!', zh: '早啊，邻居！你的田垄比我的还直！' },
  { id: 'farmer-back', who: 'farmer', face: 'farmer', en: 'Straight rows, and a crooked back!', zh: '田垄是直了，腰可弯了！' },
  { id: 'n-rabbit', who: 'narrator', face: null, en: 'Then one day, a rabbit came racing out of the woods...', say: 'Then one day... a rabbit came racing out of the woods...', zh: '有一天，一只兔子从树林里飞奔而出……' },
  { id: 'farmer-whoa', who: 'farmer', face: 'farmer', en: 'Whoa! It ran straight into the stump!', zh: '哇！它一头撞上了树桩！' },
  { id: 'farmer-dinner', who: 'farmer', face: 'farmer', en: "Rabbit stew tonight, and I didn't lift a finger!", say: "Rabbit stew tonight... and I didn't lift a finger!", zh: '今晚有兔肉吃了，我连手指都没动一下！' },
  { id: 'farmer-idea', who: 'farmer', face: 'farmer', en: "Why break my back? I'll wait right here. More rabbits are bound to come.", say: "Why break my back? ... I'll wait right here. More rabbits are bound to come.", zh: '何必累弯了腰？我就在这儿等，兔子肯定还会来。' },
  { id: 'n-waited', who: 'narrator', face: null, en: 'So he put down his hoe, and he waited.', say: 'So he put down his hoe... and he waited.', zh: '于是，他放下锄头，守在了树桩旁。' },
  { id: 'hu-what', who: 'hu', face: 'hu', en: 'Grandma, what is he doing?', zh: '奶奶，他在干什么呀？' },
  { id: 'li-rabbits', who: 'li', face: 'li', en: 'Waiting for rabbits.', zh: '等兔子呢。' },
  { id: 'hu-really', who: 'hu', face: 'hu', en: 'Really?', zh: '真的吗？' },
  { id: 'li-weeds', who: 'li', face: 'li', en: 'Song! The weeds are taking your field!', zh: '老宋！野草要把你的地吞了！' },
  { id: 'farmer-letthem', who: 'farmer', face: 'farmer', en: 'Let them! Any minute now...', zh: '随它去！兔子马上就来……' },
  { id: 'n-days', who: 'narrator', face: null, en: 'One day passed. Then another. Then a whole season.', say: 'One day passed. ... Then another. ... Then a whole season.', zh: '一天过去了。又一天。整整一季过去了。' },
  { id: 'n-harvest', who: 'narrator', face: null, en: "At harvest time, his neighbors' baskets were full of grain. His field was full of weeds.", say: "At harvest time, his neighbors' baskets were full of grain. ... His field was full of weeds.", zh: '到了收获的时候，邻居的筐里装满了粮食，他的地里却长满了野草。' },
  { id: 'hu-more', who: 'hu', face: 'hu', en: 'Did any more rabbits come?', zh: '后来又有兔子来吗？' },
  { id: 'farmer-notone', who: 'farmer', face: 'farmer', en: 'Not one.', zh: '一只也没有。' },
  { id: 'li-seeds', who: 'li', face: 'li', en: 'Here. Seeds for spring. A field waits for you, if you work it.', say: 'Here. ... Seeds for spring. ... A field waits for you, if you work it.', zh: '给，开春的种子。只要你肯下地，田地会等你的。' },
  { id: 'farmer-hoe', who: 'farmer', face: 'farmer', en: "Thank you. This time, I'll do my waiting with a hoe.", say: "Thank you. ... This time, I'll do my waiting with a hoe.", zh: '谢谢你。这一回，我拿着锄头等。' },
  { id: 'close', who: 'narrator', face: null, en: 'Luck may knock once. A harvest comes from honest work.', say: 'Luck may knock once. ... A harvest comes from honest work.', zh: '好运偶尔会来敲门，收成却要靠辛勤劳动。' },
];
