import Link from "next/link";
import { notFound } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await (await getRequestContainer()).hospitalityCrm.customerDetail(id);
  if (!customer) notFound();
  return <div className="flex min-h-screen bg-[var(--page)]"><Sidebar/><main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
    <div className="mb-5"><Link href="/customers" className="text-sm text-[var(--ink-muted)] hover:underline">← Khách hàng</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-[var(--ink-primary)]">{customer.displayName}</h1><span className="rounded-full border border-[var(--border-hairline)] px-3 py-1 text-xs font-semibold">{customer.journeyStage}</span></div><p className="mt-2 text-sm text-[var(--ink-muted)]">Kênh: {customer.channels.join(", ") || "—"} · Nguồn tiếp cận: {customer.acquisitionSources.join(", ") || "—"} · Hành trình: {customer.journeyEntries.join(", ") || "Chung"}</p></div>
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Card label="Hội thoại" value={customer.conversationCount}/><Card label="Đặt phòng" value={`${customer.verifiedBookingCount}/${customer.bookingCount}`}/><Card label="Sự kiện bán thêm" value={customer.upsellEventCount}/><Card label="Cập nhật gần nhất" value={new Date(customer.lastSeenAt).toLocaleDateString("vi-VN")}/></div>
    <section className="space-y-4"><h2 className="font-semibold text-[var(--ink-primary)]">Lịch sử đối thoại & tư vấn AI</h2>{customer.conversations.map((conversation) => <article key={conversation.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-[var(--ink-primary)]">{conversation.channel} · {conversation.intent}</p><p className="text-xs text-[var(--ink-muted)]">{conversation.acquisitionSource} · {conversation.journeyEntry}{conversation.utmCampaign ? ` · ${conversation.utmCampaign}` : ""}</p></div><span className="text-xs text-[var(--ink-muted)]">{new Date(conversation.lastMessageAt).toLocaleString("vi-VN")}</span></div><div className="space-y-2">{conversation.messages.map((message) => <div key={message.id} className={`rounded-lg border border-[var(--border-hairline)] p-3 ${message.direction === "outbound" ? "ml-6 bg-[var(--surface-raised)]" : "mr-6"}`}><div className="mb-1 flex justify-between gap-3 text-[11px] uppercase tracking-wide text-[var(--ink-muted)]"><span>{message.direction === "outbound" ? "AI → khách" : "Khách → AI"} · {message.status}</span><span>{new Date(message.createdAt).toLocaleString("vi-VN")}</span></div><p className="whitespace-pre-wrap text-sm text-[var(--ink-secondary)]">{message.content}</p></div>)}</div></article>)}{!customer.conversations.length && <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 text-sm text-[var(--ink-muted)]">Chưa có lịch sử hội thoại.</div>}</section>
  </main></div>;
}
function Card({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">{label}</p><p className="mt-2 text-xl font-semibold text-[var(--ink-primary)]">{value}</p></div>; }
