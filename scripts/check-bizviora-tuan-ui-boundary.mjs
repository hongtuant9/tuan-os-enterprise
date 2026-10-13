import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path,'utf8');
const src=read('src/app/page.tsx');
const login=read('src/app/login/page.tsx');
const proxy=read('src/proxy.ts');
const session=read('src/server/auth/session.ts');
const bridge=read('docs/architecture/BIZVIORA_TUAN_OS_AUTH_BRIDGE_20261013.md');
const checks=[
 ['original executive dashboard preserved',src.includes('ExecutiveDashboardLive')],
 ['original customer shell preserved',src.includes('Sidebar')],
 ['original login preserves password auth',login.includes('signInWithPassword')],
 ['SSR cookie auth boundary',proxy.includes('createServerClient')&&proxy.includes('request.cookies.getAll()')],
 ['server validates auth user',proxy.includes('supabase.auth.getUser()')],
 ['profile role remains authoritative',session.includes('UsersRepository')&&session.includes('normalizeRole(profile?.role)')],
 ['safe SSO architecture documented',bridge.includes('one-time authorization exchange')],
 ['prod hold recorded',bridge.includes('NO_DEPLOY')]
];
for(const [label,ok] of checks){console.log((ok?'PASS':'FAIL')+' '+label);assert.ok(ok,label)}
console.log('STATIC_GATE_PASS '+checks.length+'/'+checks.length+'; NO LIVE AUTH TEST');
