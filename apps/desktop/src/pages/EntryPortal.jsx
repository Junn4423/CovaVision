import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ScanFace,
  ShieldCheck,
  ArrowRight,
  Fingerprint,
  ShoppingCart,
  Lock,
  ExternalLink,
} from 'lucide-react'
import { ROUTES } from '../config/routes'

export default function EntryPortal() {
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedTime = currentTime.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const formattedDate = currentTime.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#e0f2fe_0%,_#f8fafc_50%,_#ffffff_100%)] flex flex-col justify-between p-6 sm:p-10 lg:p-14">
      {/* Top Header Bar */}
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between pb-6 border-b border-slate-200/80">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md shadow-blue-900/5 border border-slate-100 p-2">
            <img src="/icon.png" alt="SOF Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-slate-900">
                <span className="text-red-600">SOF </span>
                <span className="text-blue-700">FACE AI</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200/80">
                <Fingerprint size={12} className="text-sky-600" /> SOF BIOMETRIC CLOUD AI
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500">Hệ sinh thái chấm công & nhận diện sinh trắc học</p>
          </div>
        </div>

        {/* Live Clock */}
        <div className="hidden sm:flex items-center gap-4 text-right">
          <div>
            <p className="text-lg font-extrabold text-slate-800 tracking-wider font-mono">{formattedTime}</p>
            <p className="text-xs font-medium text-slate-400 capitalize">{formattedDate}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60" title="Trạng thái trực tuyến">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </header>

      {/* Main Selection Section */}
      <main className="mx-auto w-full max-w-5xl py-8 lg:py-12">
        <div className="text-center max-w-xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-bold mb-3">
            <Fingerprint size={13} />
            <span>SOF BIOMETRIC CLOUD AI</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="text-red-600">SOF </span>
            <span className="text-blue-700">FACE AI</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500 font-medium">
            Hệ sinh thái chấm công & nhận diện sinh trắc học
          </p>
          <p className="mt-4 text-xs uppercase tracking-wider font-bold text-slate-400">
            Chọn cổng truy cập hệ thống
          </p>
        </div>

        {/* 2 Portal Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Card 1: SOF FACE AI */}
          <div className="group relative rounded-3xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <ScanFace size={34} strokeWidth={2} />
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                Cổng Chấm Công
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                SOF FACE AI
              </h2>
              <p className="mt-2 text-sm text-slate-500 font-medium">
                Camera điểm danh khuôn mặt
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
              <Link
                to={ROUTES.attendance}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.99] transition-all"
              >
                <span>Sử dụng ngay</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to={ROUTES.employeeLogin}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                title="Đăng nhập tài khoản cá nhân nhân viên"
              >
                Đăng nhập cá nhân
              </Link>
            </div>
          </div>

          {/* Card 2: CỔNG QUẢN TRỊ */}
          <div className="group relative rounded-3xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 border border-blue-200/60 group-hover:bg-blue-700 group-hover:text-white transition-colors duration-300">
                <ShieldCheck size={34} strokeWidth={2} />
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                Cổng Quản Trị
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                CỔNG QUẢN TRỊ
              </h2>
              <p className="mt-2 text-sm text-slate-500 font-medium">
                Cấu hình & Quản lý nhân sự
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <Link
                to={ROUTES.login}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-700/20 hover:bg-blue-800 active:scale-[0.99] transition-all"
              >
                <span>Truy cập ngay</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Gradient Card: Mua Tài Khoản SOF (Exact sync with mobile) */}
        <div className="mt-8 max-w-4xl mx-auto rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white p-5 sm:p-6 shadow-lg shadow-blue-900/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white shrink-0 border border-white/20">
              <ShoppingCart size={22} />
            </div>
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide">MUA TÀI KHOẢN SOF</p>
              <p className="text-xs text-blue-100 mt-0.5">Trải nghiệm đầy đủ tính năng đám mây</p>
              <div className="flex items-center gap-1.5 text-[11px] text-blue-200 mt-1">
                <Lock size={12} />
                <span>Bản quyền tại sof.com.vn</span>
              </div>
            </div>
          </div>

          <a
            href="https://sof.com.vn/san-pham/nhansu/pricing"
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-blue-800 hover:bg-blue-50 font-bold text-xs shadow transition-colors"
          >
            <span>Mua ngay</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </main>

      {/* Footer Power By (Exact sync with mobile) */}
      <footer className="mx-auto w-full max-w-5xl pt-4 border-t border-slate-200/80 text-center text-xs text-slate-500 font-semibold">
        © 2026 POWERED BY <span className="text-red-600 font-bold">SOF.COM.VN</span>
      </footer>
    </div>
  )
}
