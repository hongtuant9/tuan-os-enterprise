import {loadTuanSettingsFromRls} from './verified-settings-data.mjs';
// Render with textContent only. No HTML from DB, local storage cache or DEMO fallback.
const element=(tag,label,css='')=>{
 const e=document.createElement(tag);if(label!=null)e.textContent=String(label);
 if(css)e.className=css;return e;
};
function item(label,value) {
 const e=element('div',null,'v173-service-line');
 const t=element('div',null,'v173-grow');
 t.append(element('strong',label),element('small',value));
 e.append(t);return e;
}
export async function mountVerifiedSettings({container,client,access}){
 if(!container)throw Error('LIVE_SETTINGS_CONTAINER_REQUIRED');
 container.replaceChildren(element('p','Đang tải thông tin từ Supabase (RLS)...'));
 let data;
 try{data=await loadTuanSettingsFromRls({client,access});}
 catch(error){
  if(!container.isConnected)return;
  container.replaceChildren(
    element('h3','Không thể xác minh dữ liệu Settings'),
    element('p','Không hiển thị dữ liệu DEMO khi nguồn thật lỗi hoặc quyền truy cập không hợp lệ.'),
    element('small',error?.code||'SETTINGS_UNAVAILABLE')
  );
  container.dataset.liveStatus='DENIED';
  return;
 }
 if(!container.isConnected)return;
 container.dataset.liveStatus='VERIFIED_SOURCE_READ_ONLY';
 const header=element('header',null,'v172-card');
 header.append(
  element('h2','Thông tin doanh nghiệp — nguồn dữ liệu xác thực'),
  element('p','SOURCE STAGING · READ ONLY · RLS · Không dữ liệu giả lập'),
  item('Doanh nghiệp',data.company.name),
  item('Tenant',data.company.slug),
  item('Vai trò đã kiểm tra',data.role)
 );
 const locations=element('section',null,'v172-card');
 locations.append(element('h2','Địa điểm và dịch vụ'));
 for(const unit of data.businessUnits){
  const prop=data.properties.find(x=>x.businessUnitId===unit.id);
  locations.append(item(unit.name,prop.name));
 }
 const audit=element('section',null,'v172-card');
 audit.append(element('h2','Audit theo quyền'));
 if(data.auditStatus!=='READ_ONLY'){
  audit.append(element('p','Không có quyền đọc audit.'));
 }else{
  audit.append(element('p',`Đã đọc ${data.auditEvents.length} sự kiện gần nhất (tối đa 20), chỉ thuộc tenant này.`));
  for(const x of data.auditEvents.slice(0,10))
   audit.append(item(x.operation,`${x.entityType} · ${x.at}`));
 }
 const restrictions=element('section',null,'v172-card');
 restrictions.append(
  element('h2','Chức năng chưa được kích hoạt'),
  element('p','Chỉnh sửa doanh nghiệp, quyền, kết nối, giá, đặt phòng, AI Agent và gửi khách: KHÓA.'),
  element('p','Giao diện này đang đọc project nguồn cũ; chưa phải bằng chứng migrate sang Supabase 2.0 mới.')
 );
 const grid=element('div',null,'v173-settings');
 for(const section of [header,locations,audit]) {
  const column=element('div',null,'v173-settings-column');column.append(section);grid.append(column);
 }
 container.replaceChildren(grid,restrictions);
}
