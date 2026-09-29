import test from "node:test";
import assert from "node:assert/strict";
import { canonicalKpiStatus, gapToTarget, kpiTrend, targetProgress } from "./financial-freedom-core.ts";

test("up KPI gap/progress",()=>{ assert.equal(gapToTarget(80,100,"UP"),20); assert.equal(targetProgress({actual:80,target:100,direction:"UP"}),80); });
test("down KPI debt gap",()=>{ assert.equal(gapToTarget(770,700,"DOWN"),70); });
test("debt progress uses opening baseline",()=>{ assert.equal(Math.round(targetProgress({actual:770,target:700,direction:"DOWN",opening:1000}) ?? 0),77); });
test("trend respects inverse debt direction",()=>{ assert.equal(kpiTrend(700,800,"DOWN"),"IMPROVING"); assert.equal(kpiTrend(900,800,"DOWN"),"WORSENING"); });
test("no arbitrary risk status",()=>{ assert.equal(canonicalKpiStatus({actual:80,target:100,direction:"UP",verified:true}),"NEED_VERIFY"); assert.equal(canonicalKpiStatus({actual:100,target:100,direction:"UP",verified:true}),"ACHIEVED"); });
test("no data stays no data",()=>{ assert.equal(canonicalKpiStatus({actual:null,target:100,direction:"UP",verified:false}),"NO_DATA"); });
