import { Link } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { ROUTES } from '../config/routes'
import { Button, Card } from '../components/ui'

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cv-brand-50)] dark:bg-[var(--cv-brand-950)]/50 border border-[var(--cv-brand-200)] dark:border-[var(--cv-brand-800)] flex items-center justify-center text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)] mx-auto mb-4">
          <FileQuestion className="w-8 h-8" />
        </div>

        <span className="text-xs font-bold font-mono tracking-widest text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)] uppercase">
          Lỗi 404
        </span>
        <h1 className="mt-2 text-2xl font-black text-[var(--cv-text-primary)] tracking-tight">
          Không tìm thấy trang
        </h1>
        <p className="mt-2 text-sm text-[var(--cv-text-secondary)] leading-relaxed">
          Đường dẫn bạn đang cố gắng truy cập không tồn tại hoặc đã được di chuyển trong hệ thống CovaVision.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to={ROUTES.dashboard}>
            <Button variant="primary" size="md" icon={ArrowLeft}>
              Về bảng điều khiển
            </Button>
          </Link>
          <Link to={ROUTES.attendance}>
            <Button variant="secondary" size="md">
              Điểm danh
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
