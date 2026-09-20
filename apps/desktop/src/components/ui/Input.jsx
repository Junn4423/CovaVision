import { forwardRef } from 'react'

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    iconRight: IconRight,
    onIconRightClick,
    className = '',
    id,
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-bold text-[var(--cv-text-primary)] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3 text-[var(--cv-text-tertiary)] pointer-events-none flex items-center z-10">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`cv-input ${Icon ? 'has-icon-left !pl-10' : ''} ${IconRight ? 'has-icon-right !pr-10' : ''} ${
            error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
          } ${className}`}
          {...props}
        />
        {IconRight && (
          <div
            onClick={onIconRightClick}
            className={`absolute right-3 text-[var(--cv-text-tertiary)] flex items-center ${
              onIconRightClick ? 'cursor-pointer hover:text-[var(--cv-text-primary)] transition-colors' : 'pointer-events-none'
            }`}
          >
            <IconRight className="w-4 h-4" />
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
      {!error && helperText && (
        <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">{helperText}</p>
      )}
    </div>
  )
})

export default Input
