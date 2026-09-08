import Sidebar from "@/components/Sidebar";
import ControlCenterDashboard from "@/components/ControlCenterDashboard";
import { getRequestContainer } from "@/server/container";

function vnd(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

export default async function Home() {
  const container = await getRequestContainer();
  const [tasks, approvals, agents, receptionist] = await Promise.all([
    container.tasks.list(),
    container.approvals.list(),
    container.agents.list(),
    container.aiReceptionist.dashboard(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const conversations = receptionist.conversations;
  const bookings = receptionist.bookings;
  const newLeads = conversations.filter((item) => item.customerContact && !item.customerContact.includes("Chưa có")).length;
  const roomInquiries = conversations.filter((item) => (item.intent ?? "").toLowerCase().includes("booking") || (item.intent ?? "").toLowerCase().includes("room")).length;
  const successfulBookings = bookings.filter((item) => item.verificationStatus === "verified").length;
  const conversion = conversations.length ? `${((successfulBookings / conversations.length) * 100).toFixed(1)}%` : "0%";
  const roomRevenue = bookings.filter((item) => item.verificationStatus === "verified").reduce((sum, item) => sum + Number(item.quotedPrice ?? 0), 0);
  const checkIns = bookings.filter((item) => item.checkIn === today).length;
  const checkOuts = bookings.filter((item) => item.checkOut === today).length;
  const openTasks = tasks.filter((item) => item.status !== "done").length;
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
  const agentsOnline = agents.filter((item) => item.status === "online").length;

  const metrics = [
    { label: "Hội thoại mới", value: conversations.length, hint: "Private Pilot / dữ liệu hiện có", href: "/ai-le-tan" },
    { label: "Lead mới", value: newLeads, hint: "Có thông tin liên hệ rõ ràng", href: "/#leads" },
    { label: "Khách hỏi phòng", value: roomInquiries, hint: "Theo intent hội thoại", href: "/#bookings" },
    { label: "Booking thành công", value: successfulBookings, hint: "Booking AI đã verified", href: "/#bookings" },
    { label: "Tỷ lệ chuyển đổi", value: conversion, hint: "Verified booking / hội thoại" },
    { label: "Doanh thu phòng", value: vnd(roomRevenue), hint: "Chỉ booking AI verified" },
    { label: "Doanh thu upsell", value: "—", hint: "Chờ kết nối pipeline upsell", href: "/#upsell" },
    { label: "Check-in hôm nay", value: checkIns, hint: "Theo booking AI hiện có" },
    { label: "Check-out hôm nay", value: checkOuts, hint: "Theo booking AI hiện có" },
    { label: "Phòng trống", value: "LIVE", hint: "Đọc từ KiotViet khi truy vấn", href: "/#lavender" },
    { label: "Task OpenClaw đang chờ", value: openTasks, hint: "Task chưa hoàn thành", href: "/#tasks" },
    { label: "Cảnh báo cần Tuấn xử lý", value: pendingApprovals, hint: "Approval đang pending", href: "/#approvals" },
  ];

  const health = [
    { label: "VPS", status: "FOUNDATION", note: "TUAN AI HUB được theo dõi riêng; Control Center hiện vẫn chạy trên production host hiện tại." },
    { label: "Database", status: "CONNECTED", note: "Supabase trả dữ liệu dashboard trong request hiện tại." },
    { label: "API", status: "OPERATIONAL", note: "API nội bộ đang phục vụ Control Center; KiotViet write vẫn giữ khóa an toàn." },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="flex-1 px-6 py-8 md:px-10">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">app.tamcocexperience.com</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">TUAN Hospitality AI — Control Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">Một giao diện vận hành duy nhất cho khách hàng, hội thoại, booking, Lavender, Cozy Garden, agent, phê duyệt và tình trạng hệ thống.</p>
        </header>

        <ControlCenterDashboard
          metrics={metrics}
          health={health}
          openTasks={openTasks}
          pendingApprovals={pendingApprovals}
          agentsOnline={agentsOnline}
          agentsTotal={agents.length}
          conversationCount={conversations.length}
          bookingCount={bookings.length}
          missingKnowledge={receptionist.missingDataBacklog.length}
        />
      </main>
    </div>
  );
}
