import { Link } from 'react-router-dom'
import { ROUTES } from '../config/routes'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-7 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-800">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-500">
          Đường dẫn bạn truy cập không tồn tại trong phiên bản route mới.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            to={ROUTES.portal}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
          >
            Về trang chọn cổng
          </Link>
          <Link
            to={ROUTES.login}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            Đăng nhập quản trị
          </Link>
        </div>
      </div>
    </div>
  )
}
