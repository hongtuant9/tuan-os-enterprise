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

const TINH_TRANG: Record<TinhTrang, { nhan: string; cham: string; nen: string; chu: string; vien: string }> = {
  tot: {
    nhan: "Ổn định",
    cham: "bg-emerald-400",
    nen: "bg-emerald-500/10",
    chu: "text-emerald-300",
    vien: "border-emerald-500/20",
  },
  "can-theo-doi": {
    nhan: "Cần theo dõi",
    cham: "bg-amber-400",
    nen: "bg-amber-500/10",
    chu: "text-amber-300",
    vien: "border-amber-500/20",
  },
  "nguy-co": {
    nhan: "Cần xử lý",
    cham: "bg-rose-400",
    nen: "bg-rose-500/10",
    chu: "text-rose-300",
    vien: "border-rose-500/20",
  },
  "trung-tinh": {
    nhan: "Thông tin",
    cham: "bg-slate-400",
    nen: "bg-white/[0.04]",
    chu: "text-slate-300",
    vien: "border-white/10",
  },
};

function TheTrangThai({ tinhTrang, nhan }: { tinhTrang: TinhTrang; nhan?: string }) {
  const s = TINH_TRANG[tinhTrang];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.nen} ${s.chu} ${s.vien}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.cham}`} />
      {nhan ?? s.nhan}
    </span>
  );
}

function TheChiSo({ item }: { item: ChiSoDieuHanh }) {
  const s = TINH_TRANG[item.tinhTrang];
  const inner = (
    <div className={`group relative h-full overflow-hidden rounded-2xl border bg-[var(--surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/20 ${s.vien}`}>
      <div className={`absolute inset-x-0 top-0 h-px ${s.cham} opacity-80`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{item.nhan}</p>
        <span className={`mt-0.5 h-2 w-2 rounded-full ${s.cham}`} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">{item.giaTri}</p>
      <p className="mt-1 min-h-[2.5rem] text-xs leading-5 text-[var(--ink-secondary)]">{item.moTa}</p>
      {item.nguon ? <p className="mt-2 text-[10px] text-[var(--ink-muted)]">Nguồn: {item.nguon}</p> : null}
    </div>
  );
  return item.lienKet ? <Link href={item.lienKet}>{inner}</Link> : inner;
}

function thanhPhanTram(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatTime(value?: string | null) {
  if (!value) return "Chưa có dữ liệu";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function trangThaiNguon(state: NguonDuLieu["trangThai"]) {
  if (state === "verified") return { nhan: "Đã xác minh", cls: "text-emerald-300", dot: "bg-emerald-400" };
  if (state === "stale") return { nhan: "Dữ liệu cũ", cls: "text-amber-300", dot: "bg-amber-400" };
  return { nhan: "Chưa sẵn sàng", cls: "text-rose-300", dot: "bg-rose-400" };
}

export default function ExecutiveCommandCenterV2(props: Props) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-10">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(35,91,160,0.22),rgba(21,21,24,0.95)_42%,rgba(18,18,20,0.98))] p-5 shadow-2xl shadow-black/20 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Trung tâm điều hành Tam Cốc Experience</p>
              <span className="text-[10px] italic text-[var(--ink-muted)]">(TCE Command Center)</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">Bảng điều hành dành cho Tổng giám đốc</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
              Tập trung vào kết quả, ngoại lệ và quyền kiểm soát. Số liệu không đủ nguồn sẽ không được trình bày như sự thật.
            </p>
          </div>
          <div className="grid min-w-fit grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">Trạng thái</p>
              <div className="mt-1"><TheTrangThai tinhTrang={props.sucKhoeTongThe} nhan={props.sucKhoeNhan} /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">Tác nhân đang hoạt động</p>
              <p className="mt-1 text-lg font-semibold text-white">{props.tacNhanHoatDong}/{props.tongTacNhan}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 md:col-span-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">Cập nhật gần nhất</p>
              <p className="mt-1 text-xs font-medium text-white">{formatTime(props.capNhatLuc)}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Chỉ số điều hành trọng yếu <span className="text-[10px] font-normal italic text-[var(--ink-muted)]">(KPI)</span></h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Chỉ hiển thị số liệu có nguồn hiện hữu trong hệ thống.</p>
          </div>
          <Link href="/ai-manager" className="text-xs font-semibold text-sky-300 hover:text-sky-200">Mở điều hành chi tiết →</Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          {props.chiSo.map((item) => <TheChiSo key={item.id} item={item} />)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Ba ưu tiên điều hành</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Các việc cần tạo ra tiến triển rõ ràng trước khi mở thêm quyền tự động.</p>
            </div>
            <Link href="/ai-manager" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--ink-secondary)] hover:border-white/20 hover:text-white">Xem toàn bộ công việc</Link>
          </div>
          <div className="mt-4 space-y-2">
            {props.uuTien.length === 0 ? (
              <div className="rounded-xl bg-white/[0.03] p-4 text-sm text-[var(--ink-muted)]">Chưa có công việc đủ điều kiện để đưa vào ưu tiên.</div>
            ) : props.uuTien.slice(0, 3).map((item, index) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 md:grid-cols-[36px_1fr_auto] md:items-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sm font-bold text-sky-300">0{index + 1}</div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.ten}</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">{item.id} · Chủ trì: {item.chuTri}{item.han ? ` · Hạn: ${item.han}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-[var(--ink-secondary)]">{item.mucDo}</span>
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-300">{item.trangThai}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Việc cần Tổng giám đốc duyệt</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Chỉ các quyết định vượt quyền của hệ thống.</p>
            </div>
            <div className={`rounded-xl px-3 py-2 text-xl font-semibold ${props.choDuyet > 0 ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{props.choDuyet}</div>
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
            <p className="text-xs leading-5 text-[var(--ink-secondary)]">
              Hệ thống giữ khóa với ngân sách, giá bán lớn, hoàn tiền, hủy quan trọng, quyền truy cập và thay đổi bảo mật/production rủi ro cao.
            </p>
          </div>
          <Link href="/approvals" className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400">Mở hàng chờ phê duyệt</Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-white">Ngoại lệ và rủi ro cần chú ý</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Ưu tiên nhìn phần này trước khi đi vào chi tiết.</p>
          <div className="mt-4 space-y-2">
            {props.canhBao.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4">
                <p className="text-sm font-semibold text-emerald-300">Không có ngoại lệ nghiêm trọng đang mở</p>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">Tiếp tục theo dõi task quá hạn, nguồn dữ liệu cũ và các cổng phê duyệt.</p>
              </div>
            ) : props.canhBao.slice(0, 5).map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${item.mucDo === "cao" ? "border-rose-500/20 bg-rose-500/[0.06]" : item.mucDo === "vua" ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-white/[0.07] bg-white/[0.025]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{item.tieuDe}</p>
                  <span className="text-[10px] font-semibold uppercase text-[var(--ink-muted)]">{item.id}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{item.moTa}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Tiến độ thực thi toàn công ty</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Đo từ hệ thống task hiện tại, không dùng nhận xét cảm tính.</p>
            </div>
            <span className="text-2xl font-semibold text-white">{props.tiLeHoanThanh.toFixed(0)}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-sky-400" style={{ width: `${thanhPhanTram(props.tiLeHoanThanh)}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              ["Tổng số", props.tongCongViec, "text-white"],
              ["Hoàn thành", props.hoanThanh, "text-emerald-300"],
              ["Đang làm", props.dangLam, "text-sky-300"],
              ["Bị chặn", props.biChan, "text-amber-300"],
              ["Quá hạn", props.quaHan, "text-rose-300"],
            ].map(([label, value, cls]) => (
              <div key={String(label)} className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
                <p className={`mt-1 text-xl font-semibold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Hiệu suất các phòng ban AI</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Sức khỏe được suy ra từ task đang mở, blocker và quá hạn của từng nhóm chức năng.</p>
          </div>
          <Link href="/ai-manager#executive-org" className="text-xs font-semibold text-sky-300">Xem cơ cấu →</Link>
        </div>
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {props.phongBan.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.ten}</p>
                  {item.tenVietTat ? <p className="mt-0.5 text-[10px] italic text-[var(--ink-muted)]">({item.tenVietTat})</p> : null}
                </div>
                <TheTrangThai tinhTrang={item.sucKhoe} />
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--ink-secondary)]">{item.moTa}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] uppercase text-[var(--ink-muted)]">Đang làm</p><p className="mt-1 text-sm font-semibold text-white">{item.congViecDangLam}</p></div>
                <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] uppercase text-[var(--ink-muted)]">Bị chặn</p><p className="mt-1 text-sm font-semibold text-amber-300">{item.biChan}</p></div>
                <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] uppercase text-[var(--ink-muted)]">Quá hạn</p><p className="mt-1 text-sm font-semibold text-rose-300">{item.quaHan}</p></div>
              </div>
              <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-[var(--ink-muted)]">Chỉ số chính: {item.chiSoChinh}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Hoạt động gần đây của hệ thống</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Dấu vết giúp kiểm tra AI đang làm gì và có đang vận hành thật hay không.</p>
            </div>
            <Link href="/ai-manager" className="text-xs font-semibold text-sky-300">Xem chi tiết →</Link>
          </div>
          <div className="mt-4 divide-y divide-white/[0.06]">
            {props.hoatDong.length === 0 ? <p className="py-4 text-sm text-[var(--ink-muted)]">Chưa có nhật ký hoạt động.</p> : props.hoatDong.slice(0, 8).map((item) => (
              <div key={item.id} className="grid gap-2 py-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm text-[var(--ink-secondary)]">{item.noiDung}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{item.tacNhan} · {item.loai}</p>
                </div>
                <p className="text-[11px] text-[var(--ink-muted)]">{formatTime(item.thoiGian)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-white">Độ tin cậy của dữ liệu</h2>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Nếu nguồn chính bị cũ hoặc chưa sẵn sàng, không nên dùng số liệu đó để ra quyết định.</p>
            <div className="mt-4 space-y-2">
              {props.nguonDuLieu.map((item) => {
                const s = trangThaiNguon(item.trangThai);
                return (
                  <div key={item.ten} className="rounded-xl bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{item.ten}</p>
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${s.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.nhan}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--ink-muted)]">{formatTime(item.capNhatLuc)} · {item.ghiChu}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Kiểm soát quyền và an toàn hệ thống</h2>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Đây là khu vực để kiểm tra hệ thống có vượt quyền hay không.</p>
          </div>
          <Link href="/ai-manager" className="text-xs font-semibold text-sky-300">Mở kiểm soát chi tiết →</Link>
        </div>
        <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {props.kiemSoat.map((item) => (
            <div key={item.ten} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white">{item.ten}</p>
                <TheTrangThai tinhTrang={item.tinhTrang} nhan={item.giaTri} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--ink-muted)]">{item.ghiChu}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
