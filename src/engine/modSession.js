import { ENGINE_API_VERSION, MOD_PROTOCOL_VERSION } from '../mods/compatibility.js';

// One fixed-tick authority, used by the local worker and the Node host.
export class ModSession {
  constructor(factory, options = {}) {
    this.factory=factory;this.options={...options};this.game=factory(options);this.tick=0;this.dt=1/30;
    this.journal=[];this.previous=null;this.lastSequence=new Map();
  }
  command(slot, sequence, intent) {
    if(!Number.isInteger(slot)||slot<0||slot>1||!Number.isSafeInteger(sequence)||sequence<0)return false;
    if(sequence<=(this.lastSequence.get(slot)??-1))return false;
    if(!intent||typeof intent!=='object'||JSON.stringify(intent).length>512)return false;
    const accepted=this.game.input(slot,intent);
    if(accepted)this.lastSequence.set(slot,sequence);
    if(accepted)this.journal.push({tick:this.tick,slot,intent:structuredClone(intent)});
    return accepted;
  }
  step() {this.game.update(this.dt);this.tick++;}
  release(slot) {if(![0,1].includes(slot))return;this.game.release(slot);this.journal.push({tick:this.tick,slot,release:true});}
  frame(full=false) {
    const snapshot=this.game.snapshot(),nodes=new Map(snapshot.scene.map(n=>[n.id,JSON.stringify(n)]));
    const reset=full||!this.previous||snapshot.seed!==this.previous.seed;
    const scene=reset?snapshot.scene:snapshot.scene.filter(n=>this.previous.nodes.get(n.id)!==nodes.get(n.id));
    const removed=reset?[]:[...this.previous.nodes.keys()].filter(id=>!nodes.has(id));
    const terrain=reset?snapshot.terrain:undefined;
    const {scene:ignoredScene,terrain:ignoredTerrain,...state}=snapshot;
    this.previous={nodes,seed:snapshot.seed};
    return {protocol:MOD_PROTOCOL_VERSION,apiVersion:ENGINE_API_VERSION,tick:this.tick,reset,scene,removed,state,...(terrain?{terrain}: {})};
  }
  save() {return {schemaVersion:1,options:structuredClone(this.options),tick:this.tick,journal:structuredClone(this.journal)};}
  static restore(factory, saved) {
    if(saved?.schemaVersion!==1||!Number.isInteger(saved.tick)||saved.tick<0||saved.tick>1_000_000||!Array.isArray(saved.journal))throw new Error('Unsupported or invalid mod save');
    if(saved.journal.length>1_000_000)throw new Error('Save journal too large');
    const session=new ModSession(factory,saved.options);let i=0;
    while(session.tick<=saved.tick){
      while(i<saved.journal.length&&saved.journal[i].tick===session.tick){
        const entry=saved.journal[i++];
        if(![0,1].includes(entry.slot))throw new Error('Invalid saved player slot');
        if(entry.release)session.game.release(entry.slot);else if(!entry.intent||!session.game.input(entry.slot,entry.intent))throw new Error('Invalid saved intent');
      }
      if(session.tick===saved.tick)break;
      session.step();
    }
    if(i!==saved.journal.length)throw new Error('Invalid command journal order');
    session.game.snapshot(); // Discard presentation events from historical replay.
    session.journal=structuredClone(saved.journal);return session;
  }
}
