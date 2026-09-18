import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X as XIcon, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext(null)

let toastId = 0

export function useToast() {
  return useContext(ToastContext)
}

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false)
  const duration = toast.duration || 5000

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }, [toast.id, onRemove])

  useEffect(() => {
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [dismiss, duration])

  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white',
    warning: 'bg-amber-500 text-white',
  }

  const progressColors = {
    success: 'bg-emerald-300',
    error: 'bg-red-300',
    info: 'bg-blue-300',
    warning: 'bg-amber-300',
  }

  const icons = {
    success: <Check size={16} strokeWidth={3} />,
    error: <XIcon size={16} strokeWidth={3} />,
    info: <Info size={16} strokeWidth={3} />,
    warning: <AlertTriangle size={16} strokeWidth={3} />,
  }

  return (
    <div className={`toast-item ${exiting ? 'toast-exit' : ''} ${colors[toast.type] || colors.info} rounded-xl shadow-2xl px-4 py-3 min-w-[300px]`}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold mt-0.5">
          {icons[toast.type] || icons.info}
        </span>
        <div className="flex-1 min-w-0">
          {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
          <p className="text-sm opacity-95 leading-relaxed">{toast.text}</p>
        </div>
        <button onClick={dismiss} className="flex-shrink-0 opacity-60 hover:opacity-100 mt-0.5"><XIcon size={16} /></button>
      </div>
      <div
        className={`toast-progress ${progressColors[toast.type] || progressColors.info}`}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((type, text, options = {}) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, type, text, ...options }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback({
    success: (text, opts) => addToast('success', text, opts),
    error: (text, opts) => addToast('error', text, opts),
    info: (text, opts) => addToast('info', text, opts),
    warning: (text, opts) => addToast('warning', text, opts),
  }, [addToast])

  // Make toast callable as toast.success(), toast.error() etc.
  const value = { toast, addToast, removeToast }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-container">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
