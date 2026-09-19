import { AlertTriangle, Info, Trash2, X } from 'lucide-react'
import { Button } from './Button'

/**
 * ConfirmDialog component for critical actions (delete employee, delete camera, reset settings, etc.)
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Xác nhận hành động',
  message = 'Bạn có chắc chắn muốn thực hiện hành động này?',
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  loading = false,
}) {
  if (!isOpen) return null

  const icons = {
    danger: <Trash2 className="w-6 h-6 text-rose-500" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-500" />,
    info: <Info className="w-6 h-6 text-blue-500" />,
  }

  const iconBg = {
    danger: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200/50 dark:border-rose-900/50',
    warning: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200/50 dark:border-amber-900/50',
    info: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200/50 dark:border-blue-900/50',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cv-bg-overlay)] backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[var(--cv-bg-surface)] border border-[var(--cv-border-default)] rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-[var(--cv-text-tertiary)] hover:text-[var(--cv-text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--cv-bg-surface-hover)]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl border ${iconBg[variant] || iconBg.danger} shrink-0`}>
            {icons[variant] || icons.danger}
          </div>
          <div className="flex-1 pr-6">
            <h3 className="text-base font-bold text-[var(--cv-text-primary)]">
              {title}
            </h3>
            <p className="text-sm text-[var(--cv-text-secondary)] mt-1.5 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[var(--cv-border-default)]">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
