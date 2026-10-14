// Original synthesized score. Audio time is presentation-only; rules use session dt.
import { LEVELS } from '../levels.js';
export function createScore() {
  let context,enabled=true,next=0,beat=0,current=-1;
  function unlock(){context ||= new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume().catch(()=>{});}
  function note(freq,duration,type,gain,at){const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(context.destination);o.start(at);o.stop(at+duration+.02);}
  return {unlock,toggle(){enabled=!enabled;return enabled;},update(state){if(!context||!enabled||state.phase!=='play'){next=0;return;}const l=LEVELS[state.levelIndex];if(current!==state.levelIndex||!next){current=state.levelIndex;next=context.currentTime;beat=0;}while(next<context.currentTime+.12){const frequency=220*2**(l.motif[beat%8]/12);note(frequency,.15,'triangle',.045,next);note(55*2**(l.motif[Math.floor(beat/4)%8]/12),.21,'sine',.08,next);if(beat%2===0)note(65,.08,'sine',.13,next);note(4200,.022,'square',.008,next);next+=60/l.bpm/2;beat++;}},dispose(){context?.close().catch(()=>{});}};
}
