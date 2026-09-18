import Link from "next/link";

type TinhTrang = "tot" | "can-theo-doi" | "nguy-co" | "trung-tinh";

export type ChiSoDieuHanh = {
  id: string;
  nhan: string;
  giaTri: string | number;
  moTa: string;
  tinhTrang: TinhTrang;
  lienKet?: string;
  nguon?: string;
};

export type ViecUuTien = {
  id: string;
  ten: string;
  chuTri: string;
  mucDo: string;
  trangThai: string;
  han?: string;
};

export type CanhBaoDieuHanh = {
  id: string;
  tieuDe: string;
  moTa: string;
  mucDo: "cao" | "vua" | "thap";
};

export type PhongBanDieuHanh = {
  id: string;
  ten: string;
  tenVietTat?: string;
  sucKhoe: TinhTrang;
  chiSoChinh: string;
  congViecDangLam: number;
  biChan: number;
  quaHan: number;
  moTa: string;
};

export type HoatDongGanDay = {
  id: string;
  tacNhan: string;
  noiDung: string;
  thoiGian: string;
  loai: string;
};

export type NguonDuLieu = {
  ten: string;
  trangThai: "verified" | "stale" | "unavailable";
  capNhatLuc?: string | null;
  ghiChu: string;
};

export type KiemSoatHeThong = {
  ten: string;
  giaTri: string;
  tinhTrang: TinhTrang;
  ghiChu: string;
};

type Props = {
  capNhatLuc: string;
  sucKhoeTongThe: TinhTrang;
  sucKhoeNhan: string;
  chiSo: ChiSoDieuHanh[];
  uuTien: ViecUuTien[];
  canhBao: CanhBaoDieuHanh[];
  choDuyet: number;
  phongBan: PhongBanDieuHanh[];
  hoatDong: HoatDongGanDay[];
  nguonDuLieu: NguonDuLieu[];
  kiemSoat: KiemSoatHeThong[];
  tongCongViec: number;
  hoanThanh: number;
  dangLam: number;
  biChan: number;
  quaHan: number;
  tiLeHoanThanh: number;
  tacNhanHoatDong: number;
  tongTacNhan: number;
};

const TINH_TRANG: Record<TinhTrang, { nhan: string; cham: string; text: string; border: string; soft: string; hex: string }> = {
  tot: { nhan: "Ổn định", cham: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-500/20", soft: "bg-emerald-500/[0.08]", hex: "#34d399" },
  "can-theo-doi": { nhan: "Theo dõi", cham: "bg-amber-400", text: "text-amber-300", border: "border-amber-500/20", soft: "bg-amber-500/[0.08]", hex: "#fbbf24" },
  "nguy-co": { nhan: "Xử lý", cham: "bg-rose-400", text: "text-rose-300", border: "border-rose-500/20", soft: "bg-rose-500/[0.08]", hex: "#fb7185" },
  "trung-tinh": { nhan: "Thông tin", cham: "bg-slate-400", text: "text-slate-300", border: "border-white/10", soft: "bg-white/[0.04]", hex: "#94a3b8" },
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Ring({ value, label, sub, color = "#38bdf8", size = 132 }: { value: number; label: string; sub?: string; color?: string; size?: number }) {
  const percent = clamp(value);
  return (
    <div className="flex flex-col items-center">
      <div
        className="grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${percent}%, rgba(255,255,255,.07) 0)`,
        }}
      >
        <div className="grid h-[82%] w-[82%] place-items-center rounded-full bg-[#121419] shadow-inner">
          <div className="text-center">
            <div className="text-2xl font-semibold tracking-tight text-white">{Math.round(percent)}%</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</div>
          </div>
        </div>
      </div>
      {sub ? <p className="mt-2 text-[10px] text-[var(--ink-muted)]">{sub}</p> : null}
    </div>
  );
}

function Dot({ state }: { state: TinhTrang }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${TINH_TRANG[state].cham}`} />;
}

function KpiCard({ item, emphasized = false }: { item: ChiSoDieuHanh; emphasized?: boolean }) {
  const state = TINH_TRANG[item.tinhTrang];
  const inner = (
    <div
      className={`group relative h-full overflow-hidden rounded-2xl border ${state.border} ${emphasized ? "bg-[linear-gradient(145deg,rgba(56,189,248,.08),rgba(255,255,255,.018))]" : "bg-[var(--surface)]"} p-4 transition hover:-translate-y-0.5 hover:border-white/20`}
      title={item.moTa}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-[var(--ink-muted)]">{item.nhan}</span>
        <Dot state={item.tinhTrang} />
      </div>
      <div className={`mt-2 font-semibold tracking-tight text-white ${emphasized ? "text-3xl" : "text-2xl"}`}>{item.giaTri}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-[var(--ink-muted)]">{item.nguon ?? "Hệ thống"}</span>
        <span className={`text-[10px] font-semibold ${state.text}`}>{state.nhan}</span>
      </div>
    </div>
  );
  return item.lienKet ? <Link href={item.lienKet}>{inner}</Link> : inner;
}

function sourceVisual(state: NguonDuLieu["trangThai"]) {
  if (state === "verified") return { label: "Đã xác minh", dot: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-500/15" };
  if (state === "stale") return { label: "Dữ liệu cũ", dot: "bg-amber-400", text: "text-amber-300", border: "border-amber-500/15" };
  return { label: "Chưa sẵn sàng", dot: "bg-rose-400", text: "text-rose-300", border: "border-rose-500/15" };
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {action}
    </div>
  );
}

function taskTone(status: string) {
  if (status.toLowerCase().includes("chặn")) return "border-rose-500/20 bg-rose-500/[0.06] text-rose-300";
  if (status.toLowerCase().includes("hoàn")) return "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300";
  return "border-sky-500/20 bg-sky-500/[0.06] text-sky-300";
}

export default function ExecutiveCommandCenterV2(props: Props) {
  const agentRate = props.tongTacNhan ? (props.tacNhanHoatDong / props.tongTacNhan) * 100 : 0;
  const sourceVerified = props.nguonDuLieu.filter((item) => item.trangThai === "verified").length;
  const sourceRate = props.nguonDuLieu.length ? (sourceVerified / props.nguonDuLieu.length) * 100 : 0;
  const riskCount = props.canhBao.length;
  const primaryKpis = props.chiSo.slice(0, 4);
  const secondaryKpis = props.chiSo.slice(4, 8);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,.16),transparent_32%),linear-gradient(135deg,#171a20,#101216_58%,#0d0f13)] p-5 shadow-2xl shadow-black/20 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TINH_TRANG[props.sucKhoeTongThe].border} ${TINH_TRANG[props.sucKhoeTongThe].soft} ${TINH_TRANG[props.sucKhoeTongThe].text}`}>
                <Dot state={props.sucKhoeTongThe} /> {props.sucKhoeNhan}
              </span>
              <span className="text-[10px] text-[var(--ink-muted)]">Cập nhật {formatTime(props.capNhatLuc)}</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">TCE AI Command Center</h1>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Bàn điều hành dành cho Tổng giám đốc</p>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {primaryKpis.map((item) => <KpiCard key={item.id} item={item} emphasized />)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <Ring value={props.tiLeHoanThanh} label="Tiến độ" color="#38bdf8" />
            <Ring value={agentRate} label="Tác nhân" color="#34d399" />
            <Ring value={sourceRate} label="Dữ liệu" color={sourceRate === 100 ? "#34d399" : "#fbbf24"} />
            <div className="col-span-3 grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-3 text-center">
              <div><p className="text-lg font-semibold text-white">{props.dangLam}</p><p className="text-[9px] text-[var(--ink-muted)]">Đang làm</p></div>
              <div><p className="text-lg font-semibold text-amber-300">{props.biChan}</p><p className="text-[9px] text-[var(--ink-muted)]">Bị chặn</p></div>
              <div><p className="text-lg font-semibold text-rose-300">{props.quaHan}</p><p className="text-[9px] text-[var(--ink-muted)]">Quá hạn</p></div>
              <div><p className="text-lg font-semibold text-sky-300">{props.choDuyet}</p><p className="text-[9px] text-[var(--ink-muted)]">Chờ duyệt</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryKpis.map((item) => <KpiCard key={item.id} item={item} />)}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
          <SectionTitle title="3 ưu tiên điều hành" action={<Link href="/ai-manager" className="text-[11px] font-semibold text-sky-300">Chi tiết →</Link>} />
          <div className="grid gap-2 md:grid-cols-3">
            {props.uuTien.length === 0 ? (
              <div className="md:col-span-3 rounded-xl bg-white/[0.03] p-5 text-center text-xs text-[var(--ink-muted)]">Chưa có ưu tiên đang mở.</div>
            ) : props.uuTien.slice(0, 3).map((item, index) => (
              <div key={item.id} className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5" title={`${item.id} · Chủ trì: ${item.chuTri}${item.han ? ` · Hạn: ${item.han}` : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/10 text-xs font-bold text-sky-300">{index + 1}</div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${taskTone(item.trangThai)}`}>{item.trangThai}</span>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white">{item.ten}</p>
                <p className="mt-2 truncate text-[10px] text-[var(--ink-muted)]">{item.chuTri}</p>
              </div>
            ))}
          </div>
        </div>

        <Link href="/approvals" className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 ${props.choDuyet > 0 ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-emerald-500/15 bg-emerald-500/[0.05]"}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-medium text-[var(--ink-muted)]">CEO phê duyệt</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-white">{props.choDuyet}</p>
            </div>
            <div className={`grid h-10 w-10 place-items-center rounded-full text-lg ${props.choDuyet > 0 ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>✓</div>
          </div>
          <p className="mt-4 text-xs font-semibold text-sky-300 group-hover:text-sky-200">Mở hàng chờ →</p>
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
          <SectionTitle title={`Ngoại lệ · ${riskCount}`} />
          <div className="space-y-2">
            {props.canhBao.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4 text-center">
                <div className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-300">✓</div>
                <p className="mt-2 text-xs font-semibold text-emerald-300">Không có ngoại lệ nghiêm trọng</p>
              </div>
            ) : props.canhBao.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${item.mucDo === "cao" ? "border-rose-500/18 bg-rose-500/[0.05]" : item.mucDo === "vua" ? "border-amber-500/18 bg-amber-500/[0.05]" : "border-white/[0.06] bg-white/[0.025]"}`}
                title={item.moTa}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.mucDo === "cao" ? "bg-rose-400" : item.mucDo === "vua" ? "bg-amber-400" : "bg-slate-400"}`} />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-white">{item.tieuDe}</p>
                <span className="text-[9px] text-[var(--ink-muted)]">{item.id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
          <SectionTitle title="Tiến độ toàn công ty" />
          <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
            <div className="flex justify-center">
              <Ring value={props.tiLeHoanThanh} label="Hoàn thành" color="#38bdf8" size={150} />
            </div>
            <div className="space-y-3">
              {[
                ["Hoàn thành", props.hoanThanh, props.tongCongViec ? props.hoanThanh / props.tongCongViec * 100 : 0, "bg-emerald-400"],
                ["Đang làm", props.dangLam, props.tongCongViec ? props.dangLam / props.tongCongViec * 100 : 0, "bg-sky-400"],
                ["Bị chặn", props.biChan, props.tongCongViec ? props.biChan / props.tongCongViec * 100 : 0, "bg-amber-400"],
                ["Quá hạn", props.quaHan, props.tongCongViec ? props.quaHan / props.tongCongViec * 100 : 0, "bg-rose-400"],
              ].map(([label, value, percent, color]) => (
                <div key={String(label)}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--ink-muted)]">{label}</span>
                    <span className="font-semibold text-white">{value as number}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${clamp(percent as number)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
        <SectionTitle title="Sức khỏe các phòng ban AI" action={<Link href="/ai-manager#executive-org" className="text-[11px] font-semibold text-sky-300">Cơ cấu →</Link>} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {props.phongBan.map((item) => {
            const state = TINH_TRANG[item.sucKhoe];
            return (
              <div key={item.id} className={`rounded-xl border ${state.border} bg-white/[0.02] p-3.5`} title={`${item.moTa} · KPI: ${item.chiSoChinh}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.ten}</p>
                    <p className="mt-0.5 text-[9px] italic text-[var(--ink-muted)]">{item.tenVietTat ? `(${item.tenVietTat})` : ""}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${state.text}`}><Dot state={item.sucKhoe} />{state.nhan}</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-white/[0.035] px-2 py-2"><p className="text-base font-semibold text-white">{item.congViecDangLam}</p><p className="text-[8px] text-[var(--ink-muted)]">Đang làm</p></div>
                  <div className="rounded-lg bg-white/[0.035] px-2 py-2"><p className="text-base font-semibold text-amber-300">{item.biChan}</p><p className="text-[8px] text-[var(--ink-muted)]">Bị chặn</p></div>
                  <div className="rounded-lg bg-white/[0.035] px-2 py-2"><p className="text-base font-semibold text-rose-300">{item.quaHan}</p><p className="text-[8px] text-[var(--ink-muted)]">Quá hạn</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
          <SectionTitle title="Độ tin cậy dữ liệu" />
          <div className="grid gap-2 sm:grid-cols-2">
            {props.nguonDuLieu.map((item) => {
              const state = sourceVisual(item.trangThai);
              return (
                <div key={item.ten} className={`rounded-xl border ${state.border} bg-white/[0.02] p-3`} title={item.ghiChu}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">{item.ten}</p>
                    <span className={`h-2 w-2 rounded-full ${state.dot}`} />
                  </div>
                  <p className={`mt-2 text-[10px] font-semibold ${state.text}`}>{state.label}</p>
                  <p className="mt-1 text-[9px] text-[var(--ink-muted)]">{formatTime(item.capNhatLuc)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
          <SectionTitle title="Kiểm soát quyền & an toàn" action={<Link href="/ai-manager" className="text-[11px] font-semibold text-sky-300">Chi tiết →</Link>} />
          <div className="grid gap-2 sm:grid-cols-2">
            {props.kiemSoat.slice(0, 8).map((item) => {
              const state = TINH_TRANG[item.tinhTrang];
              return (
                <div key={item.ten} className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-2.5" title={item.ghiChu}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.cham}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-white">{item.ten}</p>
                    <p className={`mt-0.5 truncate text-[9px] font-semibold ${state.text}`}>{item.giaTri}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
        <SectionTitle title="Hoạt động gần đây" action={<Link href="/ai-manager" className="text-[11px] font-semibold text-sky-300">Nhật ký →</Link>} />
        <div className="grid gap-x-5 gap-y-1 md:grid-cols-2">
          {props.hoatDong.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--ink-muted)] md:col-span-2">Chưa có hoạt động.</p>
          ) : props.hoatDong.slice(0, 6).map((item) => (
            <div key={item.id} className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-0" title={item.noiDung}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--ink-secondary)]">{item.noiDung}</p>
                <p className="mt-0.5 truncate text-[9px] text-[var(--ink-muted)]">{item.tacNhan} · {item.loai}</p>
              </div>
              <span className="shrink-0 text-[9px] text-[var(--ink-muted)]">{formatTime(item.thoiGian)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
