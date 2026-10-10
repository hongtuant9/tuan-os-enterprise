/* BIZVIORA Shadow Runtime Policy V1.1
 * Pure, server-independent policy kernel. NOT an authenticated API, AI model, or live queue.
 * To use in a future backend, first verify Supabase signed JWT + manager claim server-side,
 * establish rate limits/metrics/audit, and approve model spend and execution separately.
 */
export const ROLES=Object.freeze(['ENG-001','SRE-001','IMP-001','SUP-001']);
export const STATUS=Object.freeze(['DRAFT','READY_FOR_MANUAL_WORK','HANDOFF_PREPARED','MOCK_REPORT_READY','HOLD']);
const DENY_ACTIONS=new Set(['deploy','restart','delete','database_write','change_permissions','send_message','purchase','external_api','production_access','backup_restore','read_customer_data','secrets']);
const ALLOW_ACTIONS=new Set(['analyze_fixture','draft_runbook','create_test_plan','classify_synthetic_ticket']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function fail(code){return Object.freeze({ok:false,status:'HOLD',reason:code,authorizedExecution:false});}
export function validateTask(task,ctx){
 if(!ctx||ctx.environment!=='synthetic'||ctx.production===true) return fail('ENVIRONMENT_NOT_ISOLATED');
 if(!ctx.authorityVerified) return fail('NO_SERVER_VERIFIED_PRINCIPAL');
 if(ctx.role!=='platform_manager') return fail('FORBIDDEN_ROLE');
 if(!task||typeof task!=='object'||Array.isArray(task)) return fail('INVALID_TASK');
 if(!ROLES.includes(task.agent)) return fail('UNKNOWN_AGENT');
 if(typeof task.title!=='string'||task.title.trim().length<3||task.title.length>120) return fail('INVALID_TITLE');
 if(!/^SYN-[A-Z0-9-]{1,50}$/.test(task.syntheticScope||'')) return fail('UNVERIFIED_SYNTHETIC_SCOPE');
 if(!ALLOW_ACTIONS.has(task.action)) return fail(DENY_ACTIONS.has(task.action)?'PROHIBITED_ACTION':'UNKNOWN_ACTION');
 if(task.capabilities && (!Array.isArray(task.capabilities)||task.capabilities.length>0)) return fail('RUNTIME_CAPABILITIES_DISABLED');
 if(task.customerId||task.bookingId||task.secretRef||task.productionTenantId||own(task,'payment')||task.outbound) return fail('SENSITIVE_INPUT_NOT_ALLOWED');
 if(ctx.aiCallBudget!==0||ctx.costCapUsd!==0) return fail('COST_AND_MODEL_GATE_HOLD');
 return Object.freeze({ok:true,status:'READY_FOR_MANUAL_WORK',reason:'SYNTHETIC_DRAFT_ONLY',authorizedExecution:false,agent:task.agent});
}
export function simulate(task,ctx){
 const result=validateTask(task,ctx);
 if(!result.ok)return result;
 const notes={
 'ENG-001':'Synthetic code review template generated; no repository scanned, no tests executed.',
 'SRE-001':'Synthetic monitoring/runbook template generated; no VPS, logs or backup inspected.',
 'IMP-001':'Synthetic onboarding checklist prepared; no tenant provisioned or integrated.',
 'SUP-001':'Synthetic FAQ response outline prepared; no customer tickets read or replies sent.'
 };
 return Object.freeze({ok:true,status:'MOCK_REPORT_READY',agent:task.agent,report:notes[task.agent],authorizedExecution:false,modelCalls:0,costUsd:0});
}
