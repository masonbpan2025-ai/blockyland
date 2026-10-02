import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDebugWorld, createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { BLOCKS } from '../src/blocks.js';
test('debug world uses a flat floor, sparse edits and reset without generation',()=>{const w=createDebugWorld();assert.equal(w.getVoxel(3,-1,2),BLOCKS.STONE);assert.equal(w.getVoxel(3,0,2),BLOCKS.AIR);w.setVoxel(3,0,2,BLOCKS.FIRE);assert.equal(w.getVoxel(3,0,2),BLOCKS.FIRE);w.reset();assert.equal(w.getVoxel(3,0,2),BLOCKS.AIR);w.fluid=BLOCKS.WATER;assert.equal(w.getVoxel(0,2,0),BLOCKS.WATER);});
for(const type of DEBUG_MOBS)test(`inspector can spawn and simulate ${type}`,()=>{const s=createMobDebugSession(new THREE.Scene());s.reset(type);for(let i=0;i<12;i++)s.tick(1/60);s.player.gamemode='survival';for(let i=0;i<360;i++)s.tick(1/60);assert.ok(Number.isFinite(s.mob.health));assert.ok(s.mob.mesh.position.toArray().every(Number.isFinite));assert.ok(s.manager.mobs.length>=1 || s.mob.health<=0);s.reset('blaze');assert.equal(s.manager.mobs.length,1);});
test('inspector runs the production Blaze attack loop and damage feedback',()=>{const events=[];const s=createMobDebugSession(new THREE.Scene(),e=>events.push(e));s.reset();const angle=s.mob.tiers[0].rotation.y;s.player.gamemode='survival';for(let i=0;i<300;i++)s.tick(1/60);assert.notEqual(s.mob.tiers[0].rotation.y,angle);assert.ok(events.some(e=>e.startsWith('Target hit:')));s.hit();assert.equal(s.mob.health,17);assert.ok(s.mob.hurtTime>0);});
