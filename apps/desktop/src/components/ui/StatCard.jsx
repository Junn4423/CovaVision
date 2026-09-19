import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

/**
 * StatCard component with gradient icon badge, animated number display, and trend indicator
 */
export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend, // { value: '+12%', isPositive: true }
  color = 'blue', // 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan'
  className = '',
}) {
  const colorStyles = {
    blue: {
      bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      glow: 'hover:shadow-blue-500/10',
    },
    emerald: {
      bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      glow: 'hover:shadow-emerald-500/10',
    },
    amber: {
      bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      glow: 'hover:shadow-amber-500/10',
    },
    rose: {
      bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      glow: 'hover:shadow-rose-500/10',
    },
    purple: {
      bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      glow: 'hover:shadow-purple-500/10',
    },
    cyan: {
      bg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      glow: 'hover:shadow-cyan-500/10',
    },
  }[color] || {
    bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    glow: 'hover:shadow-blue-500/10',
  }

  return (
    <div
      className={`cv-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${colorStyles.glow} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[var(--cv-text-tertiary)] uppercase tracking-wider">
            {title}
          </p>
          <div className="text-2xl font-black text-[var(--cv-text-primary)] mt-1.5 font-sans tracking-tight">
            {value}
          </div>
          {subtitle && (
            <p className="text-xs text-[var(--cv-text-secondary)] mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-2xl border ${colorStyles.bg} shrink-0`}>
            <Icon className="w-5 h-5 stroke-[2.2]" />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3.5 pt-3 border-t border-[var(--cv-border-default)] flex items-center gap-1.5 text-xs">
          {trend.isPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
          )}
          <span
            className={`font-semibold ${
              trend.isPositive ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            {trend.value}
          </span>
          <span className="text-[var(--cv-text-tertiary)]">so với hôm qua</span>
        </div>
      )}
    </div>
  )
}

export default StatCard
