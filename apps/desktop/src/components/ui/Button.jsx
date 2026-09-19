import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Premium Button component supporting multiple variants, sizes, and loading states.
 * Variants: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'glass'
 * Sizes: 'sm' | 'md' | 'lg' | 'icon'
 */
export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon: Icon,
    iconPosition = 'left',
    className = '',
    ...props
  },
  ref
) {
  const variantClasses = {
    primary: 'cv-btn-primary',
    secondary: 'cv-btn-secondary',
    danger: 'cv-btn-danger',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md hover:shadow-emerald-500/20 active:scale-95',
    ghost: 'cv-btn-ghost',
    glass: 'cv-glass text-[var(--cv-text-primary)] hover:bg-[var(--cv-bg-surface-hover)] border border-[var(--cv-border-default)] active:scale-95',
  }[variant] || 'cv-btn-primary'

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs font-semibold rounded-lg gap-1.5',
    md: 'px-3.5 py-2 text-sm font-semibold rounded-xl gap-2',
    lg: 'px-5 py-2.5 text-base font-bold rounded-2xl gap-2.5',
    icon: 'p-2 w-9 h-9 rounded-xl justify-center items-center',
  }[size] || 'px-3.5 py-2 text-sm font-semibold rounded-xl gap-2'

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`cv-btn ${variantClasses} ${sizeClasses} ${loading || disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        Icon && iconPosition === 'left' && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      )}
    </button>
  )
})

export default Button
