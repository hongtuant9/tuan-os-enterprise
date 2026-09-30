"use client";

import { useState } from "react";

import type { VerificationGuide } from "@/components/tce/verification-guide";

function List({ items }: { items: string[] }) {
  return <ul className="space-y-1.5 text-[12px] leading-5 text-[#324e76]">{items.map((item, i)=><li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#2a78e8]"/><span>{item}</span></li>)}</ul>;
}

export default function VerificationHelp({ guide, compact = false }: { guide: VerificationGuide; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      onClick={(event)=>{ event.preventDefault(); event.stopPropagation(); setOpen(true); }}
      className={compact
        ? "inline-flex items-center gap-1 rounded bg-[#fff5e5] px-1.5 py-0.5 text-[7px] font-bold text-[#b96e00] hover:bg-[#ffedca]"
        : "mt-1 inline-flex items-center gap-1 rounded-md border border-[#f1c978] bg-[#fff9ea] px-2 py-1 text-[9px] font-bold text-[#a96400] hover:bg-[#fff0c8]"}
      title="Bấm để xem nội dung cần xác minh và cách xử lý"
    >
      <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[8px]">?</span>
      {compact ? "CẦN XÁC MINH" : "Xem cách xác minh"}
    </button>
    {open ? <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#07152f]/45 p-4" onClick={()=>setOpen(false)}>
      <div className="max-h-[88vh] w-full max-w-[860px] overflow-auto rounded-xl border border-[#d5e3f2] bg-white shadow-2xl" onClick={(e)=>e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e7eef6] bg-white px-6 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2"><span className="rounded bg-[#fff0d0] px-2 py-1 text-[10px] font-black text-[#a86200]">{guide.status}</span>{guide.severity ? <span className="rounded bg-[#edf4ff] px-2 py-1 text-[10px] font-bold text-[#286bc5]">{guide.severity}</span> : null}</div>
            <h3 className="text-[20px] font-black text-[#102456]">{guide.title}</h3>
            <p className="mt-2 max-w-[700px] text-[12px] leading-5 text-[#647b9e]">{guide.reason}</p>
          </div>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f2f6fa] text-lg text-[#506886] hover:bg-[#e7eef6]" onClick={()=>setOpen(false)}>×</button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <section className="rounded-lg border border-[#dce8f4] bg-[#f9fbfe] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">1. Thiếu gì / cần xác minh gì?</h4><List items={guide.verifyWhat}/></section>
          <section className="rounded-lg border border-[#dce8f4] bg-[#f9fbfe] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">2. Nguồn authority</h4><div className="space-y-2 text-[12px] leading-5 text-[#324e76]"><p>{guide.source || "Chưa xác định nguồn authority."}</p></div></section>
          {guide.currentEvidence?.length ? <section className="rounded-lg border border-[#cfe5d8] bg-[#f3fbf6] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#17603b]">3. Evidence hiện có</h4><List items={guide.currentEvidence}/></section> : null}
          {guide.blocker ? <section className="rounded-lg border border-[#f1d7a8] bg-[#fff9ed] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#9a6200]">4. Blocker hiện tại</h4><p className="text-[12px] font-semibold leading-5 text-[#654a1b]">{guide.blocker}</p></section> : null}
          <section className="rounded-lg border border-[#dce8f4] bg-[#f9fbfe] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">5. Cần bổ sung bằng chứng gì?</h4><List items={guide.evidenceRequired}/></section>
          <section className="rounded-lg border border-[#dce8f4] p-4"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">6. Ai chịu trách nhiệm?</h4><div className="space-y-3 text-[12px]"><div><span className="font-bold text-[#607596]">Owner xử lý:</span><p className="mt-1 font-semibold text-[#203e6b]">{guide.owner}</p></div><div><span className="font-bold text-[#607596]">Người/bộ phận cần cung cấp:</span><p className="mt-1 font-semibold text-[#203e6b]">{guide.provider}</p></div></div></section>
          <section className="rounded-lg border border-[#dce8f4] p-4 md:col-span-2"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">7. Cách xác minh / triển khai</h4><ol className="space-y-2 text-[12px] leading-5 text-[#324e76]">{guide.steps.map((item,i)=><li key={i} className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eaf3ff] text-[10px] font-black text-[#1768df]">{i+1}</span><span>{item}</span></li>)}</ol></section>
          <section className="rounded-lg border border-[#bcd5f4] bg-[#edf6ff] p-4 md:col-span-2"><h4 className="text-[12px] font-black uppercase tracking-wide text-[#175ea9]">8. Next action</h4><p className="mt-2 text-[13px] font-semibold leading-5 text-[#153b67]">{guide.nextAction}</p></section>
          <section className="rounded-lg border border-[#dce8f4] p-4 md:col-span-2"><h4 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#173b72]">9. Khi nào được VERIFIED?</h4><List items={guide.completionCriteria}/></section>
        </div>
      </div>
    </div> : null}
  </>;
}
