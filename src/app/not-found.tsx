import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page)] px-4">
      <section className="w-full max-w-lg rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-8 text-center">
        <p className="text-sm font-semibold text-[var(--accent)]">Lỗi 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">Không tìm thấy trang</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-secondary)]">
          Đường dẫn này không tồn tại hoặc đã được thay đổi. Vui lòng quay lại Trung tâm điều hành.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
          Về Tổng quan điều hành
        </Link>
      </section>
    </main>
  );
}
