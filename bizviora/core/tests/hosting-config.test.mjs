import test from 'node:test';import assert from 'node:assert/strict';
import {resolveServerBinding} from '../src/hosting-config.mjs';
const safe={BIZVIORA_STAGING_ACK:'STAGING_ONLY'};
test('defaults to loopback staging and port 4317',()=>assert.deepEqual(resolveServerBinding(safe),{host:'127.0.0.1',port:4317,scope:'STAGING_ONLY'}));
test('no staging acknowledgement must fail',()=>assert.throws(()=>resolveServerBinding({}),/STAGING_ACK_REQUIRED/));
test('Render ingress requires explicit acknowledgement',()=>assert.throws(()=>resolveServerBinding({...safe,BIZVIORA_HOSTING_TARGET:'RENDER_STAGING',PORT:'10000'}),/PUBLIC_STAGING_INGRESS_ACK_REQUIRED/));
test('approved Render staging binds all interfaces with assigned port',()=>{
 const value=resolveServerBinding({...safe,BIZVIORA_HOSTING_TARGET:'RENDER_STAGING',BIZVIORA_RENDER_PUBLIC_STAGING_ACK:'ALLOW_STAGING_INGRESS',PORT:'10000'});
 assert.deepEqual(value,{host:'0.0.0.0',port:10000,scope:'STAGING_ONLY'});
});
test('unknown hosting mode and invalid ports rejected',()=>{
 assert.throws(()=>resolveServerBinding({...safe,BIZVIORA_HOSTING_TARGET:'PRODUCTION'}),/UNAPPROVED_HOSTING_TARGET/);
 assert.throws(()=>resolveServerBinding({...safe,BIZVIORA_LOCAL_PORT:'NaN'}),/INVALID_PORT/);
 assert.throws(()=>resolveServerBinding({...safe,BIZVIORA_HOSTING_TARGET:'RENDER_STAGING',BIZVIORA_RENDER_PUBLIC_STAGING_ACK:'ALLOW_STAGING_INGRESS',PORT:'80'}),/INVALID_PORT/);
});
