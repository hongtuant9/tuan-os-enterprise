/* Founder V2.4 AI Workforce V1.0 — synthetic only; zero external API/worker calls. */
(function(){
'use strict';
const base='https://github.com/hongtuant9/tuan-os-enterprise/blob/draft/bizviora-ai-tech-team-v1-20261011/bizviora/ai-tech-team/';
const agents=[
{id:'ENG-001',name:'Senior Full-stack / Backend Engineer',group:'Engineering',icon:'db',file:'ENG-001.md',mission:'Phân tích source, API, RLS, kiểm thử và đề xuất sửa lỗi.',allow:'Đọc source, viết test và pull request nháp trên staging.',deny:'Không merge/deploy production hoặc chỉnh sửa RLS live.'},
{id:'SRE-001',name:'DevOps / Site Reliability Engineer',group:'Reliability',icon:'shield',file:'SRE-001.md',mission:'Kiểm tra chỉ số VPS, Docker, backup, restore và cảnh báo.',allow:'Đọc log đã che dữ liệu, kiểm tra sức khỏe hệ thống read-only.',deny:'Không restart, prune, xóa backup hoặc đổi cấu hình production.'},
{id:'IMP-001',name:'Technical Support / Implementation',group:'Implementation',icon:'deploy',file:'IMP-001.md',mission:'Checklist onboarding, cấu hình mẫu và UAT tenant.',allow:'Lập tài liệu và kịch bản kiểm thử synthetic.',deny:'Không tạo tenant thật, đổi quyền hoặc import dữ liệu khách.'},
{id:'SUP-001',name:'Technical Support L1',group:'Helpdesk',icon:'chat',file:'SUP-001.md',mission:'Tiếp nhận ticket, phân loại, viết phản hồi nháp.',allow:'Giải thích FAQ, phân loại sự cố và đề xuất chuyển cấp.',deny:'Không tự gửi khách, reset quyền hoặc đọc tài chính PRIVATE.'}
];
const state={tab:'all',agent:'ENG-001',showForm:false,seq:5,log:[],tasks:[
{id:'DEMO-AI-001',title:'Kiểm thử tenant A/B synthetic',agent:'ENG-001',priority:'P1'},
{id:'DEMO-AI-002',title:'Rà soát backup/restore staging',agent:'SRE-001',priority:'P1'},
{id:'DEMO-AI-003',title:'Lập checklist onboarding mẫu',agent:'IMP-001',priority:'P2'},
{id:'DEMO-AI-004',title:'Phân loại lỗi đăng nhập giả lập',agent:'SUP-001',priority:'P2'}]};
const escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const find=id=>agents.find(x=>x.id===id)||agents[0];
const css='<style id="aiw-style">'+
'.aiw{min-width:0}.aiw-note{background:#eef5ff;border:1px solid #cee0fb;border-radius:10px;padding:12px 15px;color:#295276;line-height:1.6;margin:0 0 12px}.aiw-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.aiw-btn{border:1px solid #cbd9ef;background:#fff;border-radius:7px;padding:8px 12px;color:#215da9;font-weight:700;cursor:pointer}.aiw-btn.primary,.aiw-btn.on{background:#1766d8;color:#fff;border-color:#1766d8}.aiw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:12px 0}.aiw-card,.aiw-box{border:1px solid #dbe5f3;border-radius:11px;padding:15px;background:#fff;min-width:0}.aiw-card{display:flex;flex-direction:column;gap:10px}.aiw-card.current{border-color:#73a4ef}.aiw-header{display:flex;gap:9px;align-items:flex-start}.aiw-icon{display:grid;place-items:center;width:38px;height:38px;flex:none;color:#2462b7;background:#eaf3ff;border-radius:10px}.aiw-name{font-weight:750;color:#122d56;font-size:13px}.aiw-id{font-weight:850;color:#155fbe;font-size:11px}.aiw-text{font-size:11px;color:#58708f;line-height:1.6}.aiw-footer{margin-top:auto;border-top:1px solid #edf1f8;padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px}.aiw-tag{border-radius:12px;background:#fff3dc;color:#975c0a;border:1px solid #f6d69f;padding:4px 7px;font-size:10px;font-weight:700}.aiw-cols{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}.aiw-box{margin-bottom:12px}.aiw-box h2{margin:0 0 10px;color:#152d54;font-size:15px}.aiw-fact{padding:10px 12px;background:#f5f8fc;border-radius:7px;margin-bottom:8px}.aiw-fact b{display:block;color:#2e4b74;font-size:11px;margin-bottom:4px}.aiw-table-wrap{overflow:auto}.aiw-table{min-width:590px;width:100%;border-collapse:collapse;font-size:11px}.aiw-table th,.aiw-table td{padding:11px 9px;text-align:left;border-bottom:1px solid #e8eef6}.aiw-table th{background:#f4f7fc;color:#526d90}.aiw-table td{color:#234169}.aiw-alert{background:#fff7e9;border:1px solid #f1d8ab;border-radius:8px;padding:12px;color:#805b24;line-height:1.7;font-size:11px}.aiw-controls{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}.aiw-form{padding:13px;border-radius:8px;border:1px dashed #a9c9f0;background:#f8fbff;margin-bottom:12px}.aiw-formgrid{display:grid;grid-template-columns:1fr 170px 110px;gap:10px;margin:9px 0}.aiw-form label{display:grid;gap:4px;color:#395572;font-weight:700}.aiw-form input,.aiw-form select{width:100%;border:1px solid #d0def0;border-radius:7px;padding:9px}.aiw-link{color:#1662bf;font-weight:700;text-decoration:none}.aiw-status{font-size:11px;min-height:18px;color:#215da4}.aiw-muted{font-size:11px;color:#6881a1}.aiw-fact span{color:#5e7491;font-size:11px;line-height:1.6}'+
'@media(max-width:1040px){.aiw-cols{grid-template-columns:1fr}.aiw-formgrid{grid-template-columns:1fr 1fr}.aiw-formgrid label:first-child{grid-column:1/-1}}@media(max-width:620px){.aiw-grid,.aiw-formgrid{grid-template-columns:1fr}.aiw-formgrid label:first-child{grid-column:auto}}'+
'</style>';
function card(a,ico){
 return '<article class="aiw-card '+(state.agent===a.id?'current':'')+'"><div class="aiw-header"><span class="aiw-icon">'+ico(a.icon,20)+'</span><div><div class="aiw-id">'+a.id+'</div><div class="aiw-name">'+escapeHtml(a.name)+'</div></div></div><div class="aiw-text">'+escapeHtml(a.mission)+'</div><div class="aiw-footer"><span class="aiw-tag">DRAFT · OFFLINE</span><button class="aiw-btn" type="button" data-aiw-agent="'+a.id+'">Chi tiết →</button></div></article>';
}
function overview(ico){
 return '<div class="aiw-grid">'+agents.map(a=>card(a,ico)).join('')+'</div><div class="aiw-cols">'+
 '<section class="aiw-box"><h2>Phạm vi đội kỹ thuật AI</h2><div class="aiw-fact"><b>Engineering</b><span>Rà soát source, viết test, đề xuất patch có kiểm soát.</span></div><div class="aiw-fact"><b>Reliability</b><span>Phân tích hạ tầng, phát hiện rủi ro, nhưng chưa tự chạy monitor 24/7.</span></div><div class="aiw-fact"><b>Support & Implementation</b><span>Soạn hướng dẫn và mô phỏng quy trình xử lý sự cố khách hàng.</span></div></section>'+
 '<section class="aiw-box"><h2>Cổng an toàn</h2><div class="aiw-alert"><b>SECURITY_GATE_HOLD / PRODUCTION_HOLD</b><div>Runtime: 0. Không gọi OpenAI API, GitHub, VPS, database hoặc gửi tin nhắn từ giao diện này.</div></div><p class="aiw-text">Chỉ sau khi có backend, quyền giới hạn, audit, kiểm thử và phê duyệt mới được kích hoạt Agent thật.</p><button class="aiw-btn" data-aiw-tab="rights">Xem quyền & nhật ký →</button></section></div>';
}
function people(ico){
 const a=find(state.agent);
 return '<div class="aiw-grid">'+agents.map(x=>card(x,ico)).join('')+'</div><section class="aiw-box"><div class="aiw-controls"><h2>Hồ sơ '+a.id+' · '+escapeHtml(a.group)+'</h2><a class="aiw-link" target="_blank" rel="noopener noreferrer" href="'+base+a.file+'">Cấu hình GitHub ↗</a></div>'+
 '<div class="aiw-fact"><b>Mục tiêu</b><span>'+escapeHtml(a.mission)+'</span></div><div class="aiw-fact"><b>Phạm vi L0/L1</b><span>'+escapeHtml(a.allow)+'</span></div><div class="aiw-fact"><b>Cấm mặc định</b><span>'+escapeHtml(a.deny)+'</span></div>'+
 '<div class="aiw-controls"><span class="aiw-tag">Chưa có agent runtime</span><button type="button" class="aiw-btn primary" data-aiw-copy="'+a.id+'">Sao chép lệnh ChatGPT Work</button></div></section>';
}
function tasks(){
 const form=state.showForm?'<form class="aiw-form" id="aiw-form"><b>Tạo nhiệm vụ DEMO — không gửi cho Agent thật</b><div class="aiw-formgrid">'+
 '<label>Nội dung<input required name="title" maxlength="120" minlength="3" placeholder="Lỗi đăng nhập synthetic"/></label><label>Agent<select name="agent">'+agents.map(a=>'<option value="'+a.id+'">'+a.id+'</option>').join('')+'</select></label>'+
 '<label>Ưu tiên<select name="priority"><option>P2</option><option>P1</option><option>P3</option></select></label></div><button class="aiw-btn primary" type="submit">Lưu nháp trong RAM</button> <button type="button" class="aiw-btn" data-aiw-form="close">Hủy</button></form>':'';
 return '<section class="aiw-box"><div class="aiw-controls"><div><h2>Công việc giả lập</h2><div class="aiw-muted">Không kết nối TASK-001; tải lại trang sẽ mất các nhiệm vụ tự tạo.</div></div><button type="button" class="aiw-btn primary" data-aiw-form="open">+ Tạo việc mẫu</button></div>'+form+
 '<div class="aiw-table-wrap"><table class="aiw-table"><thead><tr><th>Mã</th><th>Công việc</th><th>Agent</th><th>Ưu tiên</th><th>Trạng thái</th></tr></thead><tbody>'+
 state.tasks.map(t=>'<tr><td>'+escapeHtml(t.id)+'</td><td>'+escapeHtml(t.title)+'</td><td>'+escapeHtml(t.agent)+'</td><td>'+escapeHtml(t.priority)+'</td><td><span class="aiw-tag">CHƯA CHẠY · DEMO</span></td></tr>').join('')+'</tbody></table></div></section>';
}
function rights(){
 return '<div class="aiw-cols"><section class="aiw-box"><h2>Giới hạn quyền AI Agent</h2><div class="aiw-table-wrap"><table class="aiw-table"><thead><tr><th>Agent</th><th>L0: đọc</th><th>L1: nháp</th><th>Production</th></tr></thead><tbody>'+
 agents.map(a=>'<tr><td>'+a.id+'</td><td>Cho phép</td><td>Cho phép</td><td>KHÔNG</td></tr>').join('')+'</tbody></table></div><div class="aiw-alert">Quyền thực tế phải được backend kiểm tra, giao diện không cấp bất kỳ quyền hệ thống nào.</div></section>'+
 '<section class="aiw-box"><h2>Nhật ký phiên DEMO</h2><p class="aiw-muted">Không phải audit bất biến. Không có lượt chạy AI nào được xác minh.</p>'+
 (state.log.length?state.log.map(x=>'<div class="aiw-fact"><b>Thao tác trong RAM</b><span>'+escapeHtml(x)+'</span></div>').join(''):'<div class="aiw-fact"><b>Chưa có hoạt động</b><span>AI runtime chưa kết nối.</span></div>')+
 '<p class="aiw-muted">Muốn hoạt động thật: API backend, authentication, task queue, metering, logging, rollback và phê duyệt riêng.</p></section></div>';
}
function page(ctx){
 const nav=[['all','Tổng quan'],['people','4 nhân viên AI'],['tasks','Công việc mẫu'],['rights','Quyền & nhật ký']];
 const body=css+'<div class="aiw"><div class="aiw-note"><b>FOUNDER ONLY · STAGING SYNTHETIC</b><div>Hiển thị cấu hình của bốn nhân viên AI. Không có agent đang chạy, không có dữ liệu hoặc hành động khách hàng thực.</div></div>'+
 '<div class="aiw-tabs" role="group" aria-label="Các mục Đội ngũ AI">'+nav.map(n=>'<button type="button" class="aiw-btn '+(state.tab===n[0]?'on':'')+'" data-aiw-tab="'+n[0]+'" aria-pressed="'+(state.tab===n[0])+'">'+n[1]+'</button>').join('')+'</div>'+
 (state.tab==='people'?people(ctx.ico):state.tab==='tasks'?tasks():state.tab==='rights'?rights():overview(ctx.ico))+
 '<div id="aiw-status" class="aiw-status" role="status" aria-live="polite"></div></div>';
 return ctx.page('Đội ngũ AI — Founder','Quản lý 4 hồ sơ nhân viên kỹ thuật · bản synthetic V1.0',
 [['users','Hồ sơ AI','4','','','Đã cấu hình GitHub'],
 ['bolt','Agent đang chạy','0','','','Runtime chưa kích hoạt'],
 ['tasks','Lượt thực thi','0','','','Không có execution thực'],
 ['lock','Quyền production','0','','','Không được cấp']],body);
}
function refresh(){const app=window.BIZVIORA_FOUNDER_TEST;if(app&&app.S.route==='ai-team'&&typeof app.render==='function')app.render();}
function note(s){const el=document.getElementById('aiw-status');if(el)el.textContent=s;}
function copyCommand(a){return 'Đóng vai '+a.id+' theo '+base+a.file+'. Chỉ L0/L1 trong staging/synthetic. Đọc nguồn SSOT, đề xuất giải pháp, kiểm thử, read-back, rollback và checkpoint. Không chạm production, tài chính, quyền, secrets, dữ liệu khách hàng hoặc phát sinh phí khi chưa được phê duyệt.';}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-aiw-tab],[data-aiw-agent],[data-aiw-form],[data-aiw-copy]');if(!el)return;
 if(el.dataset.aiwTab){if(!['all','people','tasks','rights'].includes(el.dataset.aiwTab))return;state.tab=el.dataset.aiwTab;state.showForm=false;refresh();return;}
 if(el.dataset.aiwAgent){if(!agents.some(a=>a.id===el.dataset.aiwAgent))return;state.agent=el.dataset.aiwAgent;state.tab='people';refresh();return;}
 if(el.dataset.aiwForm){state.showForm=el.dataset.aiwForm==='open';refresh();return;}
 if(el.dataset.aiwCopy){if(!agents.some(a=>a.id===el.dataset.aiwCopy))return;try{
  if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error('No clipboard');
  await navigator.clipboard.writeText(copyCommand(find(el.dataset.aiwCopy)));
  note('Đã sao chép lệnh; mở ChatGPT Work để sử dụng. Không Agent nào được kích hoạt.');
 }catch(_){note('Không thể sao chép tự động. Hãy mở hồ sơ GitHub và sao chép thủ công.');}}
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='aiw-form')return;event.preventDefault();
 const form=event.target,title=String(form.elements.namedItem('title').value||'').trim(),
 agent=String(form.elements.namedItem('agent').value||''),priority=String(form.elements.namedItem('priority').value||'');
 if(title.length<3||title.length>120||!agents.some(a=>a.id===agent)||!['P1','P2','P3'].includes(priority)){note('Thông tin mẫu không hợp lệ.');return;}
 const id='DEMO-AI-'+String(state.seq++).padStart(3,'0');
 state.tasks.unshift({id,title,agent,priority});state.log.unshift('Đã tạo '+id+' · chỉ lưu RAM');state.showForm=false;refresh();
 note('Đã tạo '+id+' trong RAM · KHÔNG giao việc cho AI thật.');
});
window.BV_AI_WORKFORCE=Object.freeze({page,version:'V1.0-synthetic',getSummary:()=>({profiles:4,runtime:0,tasksDemo:state.tasks.length})});
})();