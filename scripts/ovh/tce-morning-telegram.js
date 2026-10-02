const fs = require("fs");

const REPORT_PATH = process.env.TCE_MORNING_REPORT_PATH || "/tmp/tce-morning-latest.json";
const DRY_RUN = String(process.env.TCE_MORNING_TELEGRAM_DRY_RUN || "").toLowerCase() === "true";
const MAX_AGE_MINUTES = Number(process.env.TCE_MORNING_MAX_AGE_MINUTES || 45);
const TZ = "Asia/Ho_Chi_Minh";
const OTA_CHANNELS = new Set(["booking", "agoda", "expedia", "airbnb", "trip.com", "traveloka"]);
const OTA_SOURCE_MAX_AGE_MINUTES = Number(process.env.TCE_OTA_SOURCE_MAX_AGE_MINUTES || 20);

function localDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function viDate(isoDate) {
  const [y,m,d] = String(isoDate).split("-");
  return `${d}/${m}/${y}`;
}
function shortDate(isoDate) {
  const [y,m,d] = String(isoDate).split("-");
  return `${d}/${m}`;
}
function shortRoom(v) {
  return String(v || "?").split("_")[0] || String(v || "?");
}
function shortBranch(v) {
  const s = String(v || "");
  if (/lavender/i.test(s)) return "Lavender";
  if (/ruby/i.test(s)) return "Ruby";
  return s || "?";
}
function formatClock(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "?";
  return d.toLocaleTimeString("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}
function sum(arr, key) {
  return (arr || []).reduce((s,x)=>s+Number(x?.[key]||0),0);
}
function branchLine(summary) {
  const order = ["Lavender Homestay", "Ruby Homestay", "Lavender", "Ruby"];
  const entries = Object.entries(summary || {}).sort(([a],[b]) => order.indexOf(a) - order.indexOf(b));
  const parts = [];
  for (const [branch, x] of entries) parts.push(`${shortBranch(branch)} ${Number(x.rooms||0)}P/${Number(x.guests||0)}K`);
  return parts.length ? parts.join(" | ") : "0";
}
function groupRooms(items) {
  const grouped = {};
  for (const x of Array.isArray(items) ? items : []) {
    const branch = shortBranch(x.branch);
    if (!grouped[branch]) grouped[branch] = [];
    const rooms = Array.isArray(x.rooms) ? x.rooms : [];
    if (!rooms.length) grouped[branch].push(`?(${Number(x.guests||0)})`);
    else {
      if (rooms.length === 1) grouped[branch].push(`${shortRoom(rooms[0])}(${Number(x.guests||0)})`);
      else for (const room of rooms) grouped[branch].push(shortRoom(room));
    }
  }
  return Object.entries(grouped).map(([branch,rooms]) => `   • ${branch}: ${rooms.join(", ")}`);
}
function formatRequest(x) {
  const room = x.room ? ` ${shortRoom(x.room)}` : "";
  return `${shortBranch(x.property)}${room}: ${String(x.request || "").trim()}`;
}
function otaChannelLabel(channel) {
  const map = { booking: "Booking.com", agoda: "Agoda", expedia: "Expedia", airbnb: "Airbnb", "trip.com": "Trip.com", traveloka: "Traveloka" };
  return map[channel] || channel;
}

async function restRequest(method, path, body) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("SUPABASE_ENV_NOT_SET");
  const headers = { apikey:key, Authorization:"Bearer "+key };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers.Prefer = "return=representation";
  const r = await fetch(base + "/rest/v1/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SUPABASE_HTTP_${r.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : [];
}
const rest = (path) => restRequest("GET", path);

async function getOtaInboxStatus() {
  const sourceRows = await rest("sync_sources?select=status,last_synced_at,last_error&key=eq.ai_receptionist_ota_email&limit=1");
  const source = sourceRows?.[0];
  if (!source?.last_synced_at) return { verification_status: "NEED VERIFY", reason: "chưa có thời gian đồng bộ OTA", pending_items: [] };
  const syncedAt = new Date(source.last_synced_at);
  const ageMinutes = (Date.now() - syncedAt.getTime()) / 60000;
  if (!Number.isFinite(syncedAt.getTime()) || ageMinutes > OTA_SOURCE_MAX_AGE_MINUTES || source.last_error || ["error","failed"].includes(String(source.status||"").toLowerCase())) {
    return { verification_status: "NEED VERIFY", reason: "nguồn OTA chưa đủ mới", source_last_synced_at: source.last_synced_at, pending_items: [] };
  }

  const conversations = await rest("ai_conversations?select=id,channel,source,metadata&limit=1000");
  const otaConversations = (conversations || []).filter(c =>
    OTA_CHANNELS.has(String(c.channel||"").toLowerCase()) &&
    c.metadata?.historical_import !== true
  );
  const byId = new Map(otaConversations.map(c => [c.id,c]));
  const since48h = new Date(Date.now() - 48*3600*1000).toISOString();
  const since24hMs = Date.now() - 24*3600*1000;
  const messages = await rest(`ai_messages?select=conversation_id,direction,sender_type,status,created_at&created_at=gte.${encodeURIComponent(since48h)}&limit=5000`);
  const agg = new Map();
  for (const m of messages || []) {
    if (!byId.has(m.conversation_id)) continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const a = agg.get(m.conversation_id) || { lastGuest:0, lastSent:0 };
    if (m.direction === "inbound" && m.sender_type === "guest" && m.status === "received" && t >= since24hMs) a.lastGuest = Math.max(a.lastGuest,t);
    if (m.direction === "outbound" && m.status === "sent") a.lastSent = Math.max(a.lastSent,t);
    agg.set(m.conversation_id,a);
  }

  const pending = [];
  for (const [id,c] of byId.entries()) {
    const a = agg.get(id);
    if (!a?.lastGuest || a.lastSent >= a.lastGuest) continue;
    const rawProperty = c.metadata?.page_entity || c.metadata?.reservation_context?.propertyName || "TCE";
    pending.push({
      channel:String(c.channel||"ota").toLowerCase(),
      property:shortBranch(rawProperty),
      last_guest_at:new Date(a.lastGuest).toISOString(),
    });
  }

  const by_channel = {};
  const by_property = {};
  for (const p of pending) {
    by_channel[p.channel] = (by_channel[p.channel]||0)+1;
    by_property[p.property] = (by_property[p.property]||0)+1;
  }
  return {
    verification_status:"VERIFIED",
    total:pending.length,
    by_channel,
    by_property,
    pending_items:pending,
    source_last_synced_at:source.last_synced_at,
  };
}

function validateReport(d) {
  const generated = new Date(d.generated_at);
  const today = localDate();
  if (!d.report_date || d.report_date !== today) throw new Error(`STALE_REPORT_DATE:${d.report_date||"missing"}:${today}`);
  if (!Number.isFinite(generated.getTime()) || (Date.now()-generated.getTime()) > MAX_AGE_MINUTES*60000) throw new Error("STALE_REPORT_GENERATED_AT");
}

function extract(d) {
  validateReport(d);
  const ci=d.check_in||{}, co=d.check_out||{}, ih=d.in_house||{};
  const dep=d.departmental||{}, fd=dep.front_desk||{}, hk=dep.housekeeping||{}, kitchen=dep.kitchen||{};
  const breakfast=kitchen.breakfast||{}, supplies=hk.consumables||{};
  const stayWater=supplies.stayover_supply||[];
  const waterByBranch={};
  for (const x of stayWater) {
    const k=shortBranch(x.branch);
    waterByBranch[k]=(waterByBranch[k]||0)+Number(x.water_bottles||0);
  }
  const cutoff=new Date(new Date(d.generated_at).getTime()-24*3600*1000);
  const openRequests=(Array.isArray(d.special_requests)?d.special_requests:[]).filter(x=>{
    if (x.outcome==="DONE"||x.status==="closed") return false;
    if (x.request_type==="NEED_SUPPLIES") return true;
    if (x.check_in&&x.check_in<d.report_date) return false;
    const lm=x.last_message_at?new Date(x.last_message_at):null;
    return lm&&Number.isFinite(lm.getTime())&&lm>=cutoff;
  });
  return {ci,co,ih,fd,hk,kitchen,breakfast,supplies,stayWater,waterByBranch,openRequests};
}

function breakfastRoomLines(breakfast) {
  const rooms=Array.isArray(breakfast.rooms)?breakfast.rooms:[];
  return rooms.map(x=>{
    const room=Array.isArray(x.rooms)?x.rooms.map(shortRoom).join("/"):"?";
    return `   • ${shortBranch(x.branch)} ${room}: ${Number(x.adults||0)} NL${Number(x.children||0)?` + ${Number(x.children||0)} TE`:""}`;
  });
}
function breakfastNeedVerifyLines(breakfast) {
  const rows=Array.isArray(breakfast.need_verify)?breakfast.need_verify:[];
  return rows.map(x=>{
    const room=Array.isArray(x.rooms)?x.rooms.map(shortRoom).join("/"):"?";
    return `   • ${shortBranch(x.branch)} ${room}: ${Number(x.guests||0)} khách`;
  });
}

function buildSummary(d, ota, x) {
  const otaText = ota.verification_status==="VERIFIED" ? String(ota.total||0) : "NEED VERIFY";
  return [
    `🌅 TCE | VẬN HÀNH SÁNG ${shortDate(d.report_date)}`,
    "",
    `🏨 Đang lưu trú: ${branchLine(x.fd.in_house_by_branch)}`,
    `📥 Check-in: ${Number(x.ci.room_count||0)}P / ${Number(x.ci.guest_count||0)}K`,
    `📤 Check-out: ${Number(x.co.room_count||0)}P / ${Number(x.co.guest_count||0)}K`,
    `🧹 Dọn mới: ${Number(x.hk.turnover_clean_rooms||0)}P`,
    `🍳 Ăn sáng xác nhận: ${Number(x.breakfast.confirmed_guests||0)}K`,
    `💬 OTA cần phản hồi: ${otaText}`,
    "",
    "Chi tiết công việc từng bộ phận ở các tin nhắn bên dưới.",
  ].join("\n");
}

function otaTaskLines(ota) {
  if (ota.verification_status!=="VERIFIED") {
    return [
      "1) ⚠️ KIỂM TRA OTA INBOX",
      `   • Dữ liệu: NEED VERIFY — ${ota.reason||"nguồn chưa xác minh"}`,
      "   • Việc làm: Lễ tân mở OTA và kiểm tra tin nhắn mới trước khi tiếp tục.",
    ];
  }
  if (!ota.total) return ["1) OTA Inbox: Không có tin mới cần phản hồi."];
  const lines=[`1) 🔴 Trả lời ${ota.total} tin OTA đang chờ`];
  for (const p of ota.pending_items||[]) lines.push(`   • ${otaChannelLabel(p.channel)} — ${p.property}`);
  return lines;
}

function buildFrontDeskLines(d, ota, x) {
  const lines=[`🛎 LỄ TÂN | ${shortDate(d.report_date)}`,"","VIỆC CẦN LÀM",""];
  lines.push(...otaTaskLines(ota),"");
  lines.push(`2) Rà soát check-in: ${Number(x.ci.room_count||0)} phòng / ${Number(x.ci.guest_count||0)} khách`);
  lines.push(...(groupRooms(x.ci.items).length?groupRooms(x.ci.items):["   • Không có"]),"");
  lines.push(`3) Rà soát check-out: ${Number(x.co.room_count||0)} phòng / ${Number(x.co.guest_count||0)} khách`);
  lines.push(...(groupRooms(x.co.items).length?groupRooms(x.co.items):["   • Không có"]),"");

  lines.push(`4) Yêu cầu khách cần xử lý: ${x.openRequests.length}`);
  if (x.openRequests.length) for (const r of x.openRequests) lines.push(`   • ${formatRequest(r)}`);
  else lines.push("   • Không có");
  lines.push("");

  const nv=breakfastNeedVerifyLines(x.breakfast);
  lines.push(`5) Xác minh quyền ăn sáng: ${nv.length} mục`);
  if (nv.length) {
    lines.push(...nv);
    lines.push("   • Sau khi xác minh, báo kết quả ngay trong nhóm để Bếp phục vụ.");
  } else lines.push("   • Không có");
  lines.push("");
  lines.push("✅ Hoàn thành khi: OTA đã phản hồi; check-in/check-out đã rà soát; yêu cầu đầu ca đã xử lý/được giao; mục ăn sáng cần xác minh đã chốt.");
  return lines;
}

function buildHousekeepingLines(d,x) {
  const turnover=Array.isArray(x.hk.turnover_setup)?x.hk.turnover_setup:[];
  const updates=Array.isArray(x.hk.arrival_setup_updates)?x.hk.arrival_setup_updates:[];
  const stay=groupRooms(x.hk.stayover_rooms);
  const waterEntries=Object.entries(x.waterByBranch);
  const lines=[`🧹 BUỒNG PHÒNG | ${shortDate(d.report_date)}`,"","VIỆC CẦN LÀM",""];

  lines.push(`1) Dọn mới sau check-out: ${Number(x.hk.turnover_clean_rooms||0)} phòng`);
  if (!turnover.length) {
    lines.push("   • Không có");
  } else {
    for (const t of turnover) {
      const branch=shortBranch(t.branch),room=shortRoom(t.room);
      if (t.verification_status!=="VERIFIED") {
        lines.push(`   • ⚠️ ${branch} ${room}: NEED VERIFY setup — ${t.note||"chưa đủ dữ liệu"}`);
      } else if (t.setup_source==="NEXT_BOOKING") {
        lines.push(`   • ${branch} ${room}: setup ${Number(t.setup_guests||0)} khách — booking tiếp theo ${shortDate(t.next_check_in)}`);
      } else {
        lines.push(`   • ${branch} ${room}: setup chuẩn ${Number(t.setup_guests||0)} khách (${t.room_type||"phòng"}) — chưa có booking tiếp theo`);
      }
    }
    lines.push("   • Không dùng số khách vừa checkout để setup phòng.");
  }
  lines.push("");

  lines.push(`2) Cập nhật setup cho check-in hôm nay: ${updates.length} phòng`);
  if (!updates.length) {
    lines.push("   • Không có");
  } else {
    for (const u of updates) {
      const branch=shortBranch(u.branch),room=shortRoom(u.room);
      if (u.verification_status==="VERIFIED" && u.target_setup_guests!=null) {
        if (u.reason==="NO_SETUP_STATE_STANDARD_BASELINE_DIFFERS_FROM_BOOKING") {
          lines.push(`   • 🔄 ${branch} ${room}: KIỂM TRA/UPDATE chuẩn ${u.previous_setup_guests??"?"} → booking ${u.target_setup_guests} khách`);
        } else {
          lines.push(`   • 🔄 ${branch} ${room}: UPDATE ${u.previous_setup_guests??"?"} → ${u.target_setup_guests} khách`);
        }
      } else {
        lines.push(`   • ⚠️ ${branch} ${room}: NEED VERIFY số khách từng phòng trước khi setup`);
      }
    }
    lines.push("   • Kiểm tra và điều chỉnh nước, cafe, khăn tắm, khăn mặt, bàn chải theo booking mới.");
  }
  lines.push("");

  lines.push(`3) Service phòng đang ở: ${Number(x.hk.stayover_service_rooms||0)} phòng`);
  lines.push(...(stay.length?stay:["   • Không có"]),"");

  lines.push(`4) Cấp nước stay-over: ${sum(x.stayWater,"water_bottles")} chai`);
  if (waterEntries.length) for (const [b,n] of waterEntries) lines.push(`   • ${b}: ${n} chai`);
  else lines.push("   • Không có");
  lines.push("");

  lines.push("5) Khăn: đổi theo khăn bẩn | Giấy VS: top-up theo mức chuẩn.");
  lines.push("");
  lines.push("✅ Hoàn thành khi: phòng checkout đã dọn và setup đúng booking tiếp theo/tiêu chuẩn; các mục UPDATE check-in đã điều chỉnh; stay-over service và nước/khăn/giấy đã cấp đủ.");
  return lines;
}

function buildKitchenLines(d,x) {
  const confirmed=breakfastRoomLines(x.breakfast);
  const nv=breakfastNeedVerifyLines(x.breakfast);
  const lines=[`🍳 BẾP / ĂN SÁNG | ${shortDate(d.report_date)}`,"","VIỆC CẦN LÀM",""];
  lines.push(`1) Chuẩn bị: ${Number(x.breakfast.confirmed_guests||0)} khách (${Number(x.breakfast.confirmed_adults||0)} NL + ${Number(x.breakfast.confirmed_children||0)} TE)`);
  lines.push(...(confirmed.length?confirmed:["   • Không có khách đã xác nhận"]),"");
  lines.push(`2) Chờ Lễ tân xác minh trước khi phục vụ: ${nv.length} mục`);
  lines.push(...(nv.length?nv:["   • Không có"]));
  if (nv.length) lines.push("   • Không tự đoán quyền ăn sáng; chờ Lễ tân báo lại trong nhóm.");
  lines.push("");
  lines.push("✅ Hoàn thành khi: đã phục vụ xong toàn bộ khách ăn sáng đã xác nhận và các trường hợp được Lễ tân chốt bổ sung.");
  return lines;
}

function renderTask(lines,state="NOTIFIED",actor="",stateAt="",notifiedAt="") {
  let status=`Thông báo (${formatClock(notifiedAt)})`;
  if (state==="ACKNOWLEDGED") status=`Đang làm - ${actor||"Nhân viên"} (${formatClock(stateAt)})`;
  if (state==="DONE") status=`Hoàn thành - ${actor||"Nhân viên"} (${formatClock(stateAt)})`;
  return [...lines,"",`📌 Trạng thái: ${status}`].join("\n");
}

async function getGroupId() {
  const rows=await rest("sync_sources?select=last_cursor&key=eq.telegram-operations-group&limit=1");
  return rows?.[0]?.last_cursor?.trim()||"";
}

async function telegramSend(chatId,text,replyMarkup) {
  const token=process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN_NOT_SET");
  const body={chat_id:chatId,text,disable_web_page_preview:true};
  if (replyMarkup) body.reply_markup=replyMarkup;
  const r=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  const raw=await r.text();
  if (!r.ok) throw new Error(`TELEGRAM_HTTP_${r.status}:${raw.slice(0,300)}`);
  return JSON.parse(raw);
}

async function ensureDepartmentTask({reportDate,department,label,lines,notifiedAt}) {
  const externalId=`morning-ops:${reportDate}:${department}`;
  const existing=await rest(`ai_conversations?select=id,status,metadata&channel=eq.other&external_conversation_id=eq.${encodeURIComponent(externalId)}&limit=1`);
  let conversation=existing?.[0];

  if (!conversation) {
    const rows=await restRequest("POST","ai_conversations?select=id,status,metadata",{
      channel:"other",
      external_conversation_id:externalId,
      customer_name:`TCE Morning Ops - ${label}`,
      language:"vi",
      intent:"guest_message",
      status:"needs_manager",
      mode:"live",
      last_message_at:notifiedAt,
      metadata:{
        source:"MORNING_BRIEF_DEPARTMENT",
        report_date:reportDate,
        department,
        department_label:label,
        body_lines:lines,
        task_status:"NOTIFIED",
        notified_at:notifiedAt,
      },
      source:"MORNING_BRIEF_DEPARTMENT",
      primary_intent:"OPERATIONS_TASK",
      lead_status:"SUPPORT",
      routed_agent:"Manager Agent",
      human_handoff:true,
      verification_status:"VERIFIED",
    });
    conversation=rows[0];
  }

  let reviews=await rest(`ai_manager_reviews?select=id,status,evidence&conversation_id=eq.${conversation.id}&review_type=eq.service_request&limit=1`);
  let review=reviews?.[0];
  if (!review) {
    const rows=await restRequest("POST","ai_manager_reviews?select=id,status,evidence",{
      conversation_id:conversation.id,
      review_type:"service_request",
      title:`Morning Brief · ${label} · ${reportDate}`,
      guest_request:lines.join("\n"),
      reason:"Công việc đầu ngày được sinh từ TCE Morning Brief.",
      evidence:{
        source:"MORNING_BRIEF_DEPARTMENT",
        report_date:reportDate,
        department,
        department_label:label,
        body_lines:lines,
        task_status:"NOTIFIED",
        notified_at:notifiedAt,
      },
      recommendation:"Bộ phận xác nhận nhận việc trên Telegram và đánh dấu Hoàn thành khi đạt Definition of Done.",
      risk_level:"low",
      status:"pending",
    });
    review=rows[0];
  }
  return {conversation,review};
}

async function attachTelegramEvidence(conversation,review,chatId,messageId) {
  const convMeta={...(conversation.metadata||{}),telegram_chat_id:String(chatId),telegram_message_id:messageId};
  const revEvidence={...(review.evidence||{}),telegram_chat_id:String(chatId),telegram_message_id:messageId};
  await restRequest("PATCH",`ai_conversations?id=eq.${conversation.id}`,{metadata:convMeta});
  await restRequest("PATCH",`ai_manager_reviews?id=eq.${review.id}`,{evidence:revEvidence});
}

async function sendDepartmentTask(chatId,task) {
  const {conversation,review}=await ensureDepartmentTask(task);
  const alreadySent=review?.evidence?.telegram_message_id;
  if (alreadySent) return {skipped:true,reviewId:review.id,messageId:alreadySent};

  const text=renderTask(task.lines,"NOTIFIED","",task.notifiedAt,task.notifiedAt);
  const sent=await telegramSend(chatId,text,{
    inline_keyboard:[[
      {text:"✅ Xác nhận",callback_data:`morning_ack:${review.id}`},
      {text:"🏁 Hoàn thành",callback_data:`morning_done:${review.id}`},
    ]],
  });
  const messageId=sent?.result?.message_id;
  if (!messageId) throw new Error("TELEGRAM_MESSAGE_ID_MISSING");
  await attachTelegramEvidence(conversation,review,chatId,messageId);
  return {skipped:false,reviewId:review.id,messageId};
}

(async()=>{
  const d=JSON.parse(fs.readFileSync(REPORT_PATH,"utf8"));
  try {
    const ota=await getOtaInboxStatus();
    const x=extract(d);
    const notifiedAt=new Date().toISOString();

    const summary=buildSummary(d,ota,x);
    const tasks=[
      {reportDate:d.report_date,department:"front_desk",label:"Lễ tân",lines:buildFrontDeskLines(d,ota,x),notifiedAt},
      {reportDate:d.report_date,department:"housekeeping",label:"Buồng phòng",lines:buildHousekeepingLines(d,x),notifiedAt},
      {reportDate:d.report_date,department:"kitchen",label:"Bếp / Ăn sáng",lines:buildKitchenLines(d,x),notifiedAt},
    ];

    if (DRY_RUN) {
      console.log(summary);
      for (const task of tasks) {
        console.log("\n------------------------------\n");
        console.log(renderTask(task.lines,"NOTIFIED","",task.notifiedAt,task.notifiedAt));
        console.log("\n[ Nút: ✅ Xác nhận | 🏁 Hoàn thành ]");
      }
      return;
    }

    const groupId=await getGroupId();
    if (!groupId) throw new Error("TELEGRAM_OPERATIONS_GROUP_NOT_BOUND");

    await telegramSend(groupId,summary);
    for (const task of tasks) await sendDepartmentTask(groupId,task);

    console.log(JSON.stringify({ok:true,type:"morning_brief_option_a",report_date:d.report_date,department_tasks:3}));
  } catch(e) {
    const msg=`⚠️ TCE | BÁO CÁO 06:00 CHƯA SẴN SÀNG\nDữ liệu vận hành sáng nay chưa đủ mới/đã xác minh. Không sử dụng số liệu cũ. Quản lý vui lòng kiểm tra TCE Runtime.\nLỗi: ${String(e.message||e).split(":")[0]}`;
    if (DRY_RUN) { console.log(msg); return; }
    const groupId=await getGroupId();
    if (!groupId) throw e;
    await telegramSend(groupId,msg);
    console.log(JSON.stringify({ok:true,type:"stale_warning"}));
  }
})().catch(e=>{console.error(JSON.stringify({ok:false,error:String(e.message||e)}));process.exit(1)});