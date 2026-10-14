// Read-only TASK_MASTER contract. Rows must come from authorized server-side Sheets access.
export const TASK_MASTER_RANGE = 'TASK_MASTER!A162:Z180';
export const ROADMAP_PREFIX = 'TASK-BIZ-ROADMAP-20261013-';
export const ALLOWED_STATUS = new Set(['PASS','IN_PROGRESS','NOT_STARTED','BLOCKED']);
export function normalizeRoadmap(rows) {
  if (!Array.isArray(rows)) throw new Error('SHEETS_DATA_INVALID');
  const byId = new Map();
  for (const row of rows) {
    if (!Array.isArray(row)) throw new Error('SHEETS_ROW_INVALID');
    const id=String(row[0]??'').trim();
    if (!id.startsWith(ROADMAP_PREFIX)) continue;
    const status=String(row[9]??'').trim();
    const milestone=String(row[20]??'').trim();
    if (!ALLOWED_STATUS.has(status) || !/^M[0-6]$/.test(milestone)) throw new Error('ROADMAP_SCHEMA_INVALID');
    if (byId.has(id)) throw new Error('ROADMAP_DUPLICATE_ID');
    byId.set(id,Object.freeze({id,milestone,title:String(row[4]??''),status,priority:String(row[7]??''),dependency:String(row[11]??''),acceptance:String(row[12]??''),evidence:String(row[16]??''),source:String(row[17]??''),gate:String(row[23]??'')}));
  }
  if (byId.size !== 19) throw new Error('ROADMAP_COUNT_MISMATCH');
  const tasks=[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const counts=Object.fromEntries([...ALLOWED_STATUS].map(s=>[s,tasks.filter(t=>t.status===s).length]));
  return Object.freeze({source:'TASK_MASTER',scope:'BIZVIORA_ROADMAP',total:tasks.length,counts,tasks});
}
