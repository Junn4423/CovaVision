/**
 * Tabs component with animated active indicator and support for icons
 */
export function Tabs({ tabs, activeTab, onChange, className = '' }) {
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] rounded-xl ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
              isActive
                ? 'bg-[var(--cv-bg-surface)] text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)] shadow-xs font-bold'
                : 'text-[var(--cv-text-secondary)] hover:text-[var(--cv-text-primary)] hover:bg-[var(--cv-bg-surface-hover)]/60'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
