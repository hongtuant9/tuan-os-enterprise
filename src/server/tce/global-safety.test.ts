import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("critical TCE routes and navigation remain present",()=>{
  const shell=read("src/components/tce/TceShell.tsx");
  for(const route of ["/ai-le-tan","/business","/marketing","/finance","/personal-finance"]){
    assert.match(shell,new RegExp(`href: \"${route.replaceAll("/","\\/")}\"`));
    assert.equal(fs.existsSync(path.join(root,"src/app",route.slice(1),"page.tsx")),true,`missing ${route}`);
  }
});

test("AI Receptionist freshness is scoped without changing global shell contract",()=>{
  const screen=read("src/components/tce/ReferenceScreens.tsx");
  const shell=read("src/components/tce/TceShell.tsx");
  assert.match(screen,/DataFreshnessBar/);
  assert.doesNotMatch(shell,/DataFreshnessBar/);
});

test("AI Receptionist route remains dynamic and canonical-data backed",()=>{
  const page=read("src/app/ai-le-tan/page.tsx");
  assert.match(page,/dynamic = \"force-dynamic\"/);
  assert.match(page,/getTceTabLiveData\(\"reception\"/);
  assert.doesNotMatch(page,/static snapshot|mock data/i);
});
