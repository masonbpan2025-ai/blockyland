import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentKeyVault,VAULT_PREFIX} from '../src/agentKeyVault.js';
import {AgentSettings} from '../src/agentProviders.js';
const pass='a unique long test passphrase',secret='fake-api-key-for-tests-only';
const storage=initial=>{const data=new Map(Object.entries(initial||{}));return {
  getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),dump:()=>Object.fromEntries(data)};};
const vault=store=>new AgentKeyVault(store,['claude','gemini']);

test('session keys never persist or appear in exported settings',()=>{
  const store=storage(),settings=new AgentSettings(store);
  settings.setKey('claude',secret);
  assert.equal(settings.keyFor('claude'),secret);
  assert.ok(!JSON.stringify(store.dump()).includes(secret));
  assert.ok(!JSON.stringify(settings).includes(secret));
  assert.equal(new AgentSettings(store).keyFor('claude'),'');
  settings.vault.lock('claude');assert.equal(settings.keyFor('claude'),'');
});
test('remember encrypts; reload requires explicit unlock; lock retains ciphertext; delete removes it',async()=>{
  const store=storage(),v=vault(store);await v.remember('claude',secret,pass);
  const raw=store.getItem(VAULT_PREFIX+'claude');assert.ok(raw);
  assert.ok(!raw.includes(secret)&&!raw.includes(pass));assert.equal(store.getItem('mc_agent_key_claude'),null);
  assert.deepEqual(v.status('claude'),{active:true,remembered:true,locked:false});
  const fresh=vault(store);assert.equal(fresh.keyFor('claude'),'');assert.equal(fresh.status('claude').locked,true);
  await fresh.unlock('claude',pass);assert.equal(fresh.keyFor('claude'),secret);
  fresh.lock('claude');assert.equal(fresh.keyFor('claude'),'');assert.equal(store.getItem(VAULT_PREFIX+'claude'),raw);
  fresh.delete('claude');assert.equal(store.getItem(VAULT_PREFIX+'claude'),null);assert.equal(fresh.keyFor('claude'),'');
});
test('wrong passphrases and modified ciphertext fail without unlocking',async()=>{
  const store=storage(),v=vault(store);await v.remember('claude',secret,pass);v.lock('claude');
  await assert.rejects(v.unlock('claude','the wrong passphrase'),/incorrect passphrase/);assert.equal(v.keyFor('claude'),'');
  const r=JSON.parse(store.getItem(VAULT_PREFIX+'claude'));r.ciphertext=(r.ciphertext[0]==='A'?'B':'A')+r.ciphertext.slice(1);
  store.setItem(VAULT_PREFIX+'claude',JSON.stringify(r));
  await assert.rejects(v.unlock('claude',pass),/damaged vault/);assert.equal(v.keyFor('claude'),'');
});
test('vault is bound to its vendor; each save gets a new salt and IV',async()=>{
  const store=storage(),v=vault(store);await v.remember('claude',secret,pass);
  const a=JSON.parse(store.getItem(VAULT_PREFIX+'claude'));await v.remember('claude',secret,pass);
  const b=JSON.parse(store.getItem(VAULT_PREFIX+'claude'));assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
  store.setItem(VAULT_PREFIX+'gemini',JSON.stringify(b));await assert.rejects(v.unlock('gemini',pass),/damaged vault/);
  assert.equal(v.keyFor('gemini'),'');assert.equal(v.keyFor('claude'),secret);
});
test('legacy plaintext is recovered once into memory and removed, including both Gemini names',()=>{
  const store=storage({'mc_agent_key_claude':secret,'mc_agent_key_gemini':'new-google','gemini_api_key':'old-google'});
  const v=vault(store);assert.equal(v.keyFor('claude'),secret);assert.equal(v.keyFor('gemini'),'new-google');
  assert.deepEqual(store.dump(),{});assert.deepEqual(v.migratedVendors,['claude','gemini']);assert.equal(vault(store).keyFor('claude'),'');
});
test('an existing encrypted vault stays locked even if an old plaintext entry is present',async()=>{
  const store=storage(),v=vault(store);await v.remember('claude',secret,pass);store.setItem('mc_agent_key_claude','obsolete');
  const fresh=vault(store);assert.equal(fresh.keyFor('claude'),'');assert.equal(fresh.status('claude').locked,true);
  assert.equal(store.getItem('mc_agent_key_claude'),null);await fresh.unlock('claude',pass);assert.equal(fresh.keyFor('claude'),secret);
});
test('explicit session-only choice removes previous vault without touching another vendor',async()=>{
  const store=storage(),v=vault(store);await v.remember('claude',secret,pass);await v.remember('gemini','fake-google',pass);
  const google=store.getItem(VAULT_PREFIX+'gemini');v.setSession('claude','replacement');
  assert.equal(store.getItem(VAULT_PREFIX+'claude'),null);assert.equal(store.getItem(VAULT_PREFIX+'gemini'),google);
  assert.equal(v.keyFor('claude'),'replacement');assert.equal(vault(store).keyFor('claude'),'');
});
test('malformed vaults and unsupported parameters are rejected before expensive derivation',async()=>{
  const store=storage(),v=vault(store);
  for(const raw of ['{','null',JSON.stringify({version:9}),JSON.stringify({version:1,iterations:999999999})]){
    store.setItem(VAULT_PREFIX+'claude',raw);await assert.rejects(v.unlock('claude',pass),/Invalid saved vault/);
  }
  v.delete('claude');await assert.rejects(v.unlock('claude',pass),/No remembered key/);
  await assert.rejects(v.remember('claude',secret,'short'),/at least 12/);
  await assert.rejects(v.remember('claude','',pass),/valid API key/);
  assert.throws(()=>v.setSession('unknown',secret),/Unknown/);
});
test('locking or deleting during async encryption/unlock cannot resurrect an active key',async()=>{
  const store=storage(),v=vault(store);
  const saving=v.remember('claude',secret,pass);v.lock('claude');await assert.rejects(saving,/canceled/);assert.equal(store.getItem(VAULT_PREFIX+'claude'),null);
  await v.remember('claude',secret,pass);v.lock('claude');const unlocking=v.unlock('claude',pass);v.delete('claude');
  await assert.rejects(unlocking,/canceled/);assert.equal(v.keyFor('claude'),'');assert.equal(store.getItem(VAULT_PREFIX+'claude'),null);
});
test('storage unavailable or full never silently falls back to plaintext persistence',async()=>{
  const v=vault(null);v.setSession('claude',secret);assert.equal(v.keyFor('claude'),secret);
  await assert.rejects(v.remember('claude',secret,pass),/storage is unavailable/);
  const store=storage();store.setItem=()=>{throw new Error('storage full');};const full=vault(store);full.setSession('claude',secret);
  await assert.rejects(full.remember('claude','replacement',pass),/storage full/);assert.equal(full.keyFor('claude'),secret);assert.deepEqual(store.dump(),{});
});
test('blocked browser storage still permits a memory-only key',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw new Error('blocked');}}});
  try {
    const settings=new AgentSettings();assert.equal(settings.store,null);
    settings.setKey('claude',secret);assert.equal(settings.keyFor('claude'),secret);
    assert.equal(new AgentSettings().keyFor('claude'),'');
  } finally {if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
