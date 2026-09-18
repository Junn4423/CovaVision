import React from 'react'
import { Link } from 'react-router-dom'

const baseClassName = [
  'w-full sm:w-auto inline-flex items-center justify-center gap-2',
  'px-4 py-2.5 rounded-xl border border-slate-200 bg-white',
  'text-sm font-semibold text-slate-700 shadow-sm',
  'hover:bg-slate-50 hover:border-slate-300 transition-colors',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white',
].join(' ')

export default function ReportActionButton({
  to,
  icon: Icon,
  children,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
}) {
  const classes = `${baseClassName} ${className}`.trim()
  const content = (
    <>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={classes}
        aria-disabled={disabled}
        onClick={event => {
          if (disabled) {
            event.preventDefault()
          }
          if (typeof onClick === 'function') {
            onClick(event)
          }
        }}
      >
        {content}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  )
}
