/**
 * Card Component with glass, interactive, and header/body sub-components
 */
export function Card({
  children,
  variant = 'default', // 'default' | 'glass' | 'interactive' | 'outline'
  className = '',
  ...props
}) {
  const variantClass = {
    default: 'cv-card',
    glass: 'cv-glass rounded-2xl',
    interactive: 'cv-card cv-card-interactive cursor-pointer',
    outline: 'bg-transparent border border-[var(--cv-border-default)] rounded-2xl',
  }[variant] || 'cv-card'

  return (
    <div className={`${variantClass} ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`p-5 pb-3 border-b border-[var(--cv-border-default)] flex items-center justify-between gap-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', ...props }) {
  return (
    <h3 className={`text-base font-bold text-[var(--cv-text-primary)] flex items-center gap-2 ${className}`} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className = '', ...props }) {
  return (
    <p className={`text-xs text-[var(--cv-text-tertiary)] mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`p-5 pt-3 border-t border-[var(--cv-border-default)] flex items-center justify-between gap-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

Card.Header = CardHeader
Card.Title = CardTitle
Card.Description = CardDescription
Card.Content = CardContent
Card.Footer = CardFooter

export default Card
