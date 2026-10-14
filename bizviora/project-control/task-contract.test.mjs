import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoadmap} from './task-contract.mjs';
const rows=Array.from({length:19},(_,i)=>{const r=Array(26).fill('');r[0]=`TASK-BIZ-ROADMAP-20261013-${String(i+1).padStart(2,'0')}`;r[9]=i===0?'PASS':i<6?'IN_PROGRESS':i<15?'NOT_STARTED':'BLOCKED';r[20]='M'+Math.min(6,Math.floor(i/3));return r});
test('19 unique roadmap tasks with exact status counts',()=>{const out=normalizeRoadmap(rows);assert.equal(out.total,19);assert.deepEqual(out.counts,{PASS:1,IN_PROGRESS:5,NOT_STARTED:9,BLOCKED:4})});
test('duplicate IDs fail closed',()=>assert.throws(()=>normalizeRoadmap([...rows,rows[0]]),/DUPLICATE/));
test('missing row fails closed',()=>assert.throws(()=>normalizeRoadmap(rows.slice(1)),/COUNT_MISMATCH/));
test('unknown status fails closed',()=>assert.throws(()=>normalizeRoadmap(rows.map((r,i)=>i? r:[...r.slice(0,9),'DONE',...r.slice(10)])),/SCHEMA_INVALID/));
test('non-roadmap rows excluded',()=>assert.equal(normalizeRoadmap([['OTHER-ID'],...rows]).total,19));
