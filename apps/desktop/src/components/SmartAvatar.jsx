import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { resolveEmployeeAvatar } from '../utils/avatarUtils'

const INITIAL_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-teal-100 text-teal-800 border-teal-200',
]

function getInitialColor(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % INITIAL_COLORS.length
  return INITIAL_COLORS[index]
}

function getInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SmartAvatar({
  employee,
  size = 42,
  preferredSource = 'local',
  showRing = false,
  className = '',
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUri = resolveEmployeeAvatar(employee, preferredSource)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUri])

  const name = employee?.name || employee?.employee_name || ''
  const employeeId = employee?.employee_id || employee?.id || ''
  const initials = getInitials(name || employeeId)
  const colorClass = getInitialColor(employeeId || name)

  // Status ring color
  let ringBorder = 'border-slate-200'
  let ringBg = 'bg-slate-50'
  if (showRing) {
    if (employee?.has_face || employee?.status_code === 'ready') {
      ringBorder = 'border-emerald-500'
      ringBg = 'bg-emerald-500/10'
    } else if (employee?.has_local_image || employee?.status_code === 'image_only') {
      ringBorder = 'border-sky-500'
      ringBg = 'bg-sky-500/10'
    } else {
      ringBorder = 'border-amber-400'
      ringBg = 'bg-amber-400/10'
    }
  }

  const innerSize = showRing ? size - 6 : size

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-2xl select-none ${
        showRing ? `p-[3px] border-2 ${ringBorder} ${ringBg}` : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {imageUri && !imageFailed ? (
        <img
          src={imageUri}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover rounded-[13px] bg-slate-100 shadow-2xs"
          style={{ width: innerSize, height: innerSize }}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center rounded-[13px] font-bold text-xs border shadow-2xs ${colorClass}`}
          style={{ width: innerSize, height: innerSize }}
          title={name || employeeId}
        >
          {initials || <User size={innerSize * 0.5} />}
        </div>
      )}
    </div>
  )
}
