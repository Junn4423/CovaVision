import { FolderOpen } from 'lucide-react'
import { Button } from './Button'

/**
 * EmptyState component with icon, title, description, and action button
 */
export function EmptyState({
  icon: Icon = FolderOpen,
  title = 'Không có dữ liệu',
  description = 'Hiện tại chưa có bản ghi nào để hiển thị.',
  actionLabel,
  onAction,
  actionIcon,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-hover)]/30 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] flex items-center justify-center text-[var(--cv-text-tertiary)] shadow-xs mb-4">
        <Icon className="w-7 h-7 stroke-[1.5]" />
      </div>
      <h3 className="text-base font-bold text-[var(--cv-text-primary)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--cv-text-secondary)] max-w-sm mt-1 mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} icon={actionIcon} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export default EmptyState
