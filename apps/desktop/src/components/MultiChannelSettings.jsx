import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, RefreshCw, Server, Zap } from 'lucide-react'
import {
  CHANNEL_DESCRIPTIONS,
  buildChannelsFromLv777,
  loadSelectedChannelId,
  pingAiChannel,
  saveSelectedChannelId,
  setActiveAiHost,
} from '../services/channelService'
import { getGatewayAuth } from '../services/api'
import { useToast } from './Toast'

const THEME_STYLES = {
  green: {
    bg: 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300',
    activeBg: 'bg-emerald-50/90 border-emerald-600 ring-2 ring-emerald-500/20 shadow-md shadow-emerald-900/5',
    iconBg: 'bg-emerald-100 text-emerald-700',
    accent: 'text-emerald-900',
    subText: 'text-emerald-700/90',
    badgeBg: 'bg-emerald-600 text-white',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    pingBorder: 'border-emerald-300 text-emerald-700 hover:bg-emerald-100/50',
  },
  yellow: {
    bg: 'bg-amber-50/50 border-amber-200 hover:border-amber-300',
    activeBg: 'bg-amber-50/90 border-amber-600 ring-2 ring-amber-500/20 shadow-md shadow-amber-900/5',
    iconBg: 'bg-amber-100 text-amber-700',
    accent: 'text-amber-950',
    subText: 'text-amber-800/90',
    badgeBg: 'bg-amber-600 text-white',
    buttonBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
    pingBorder: 'border-amber-300 text-amber-700 hover:bg-amber-100/50',
  },
  rose: {
    bg: 'bg-rose-50/50 border-rose-200 hover:border-rose-300',
    activeBg: 'bg-rose-50/90 border-rose-600 ring-2 ring-rose-500/20 shadow-md shadow-rose-900/5',
    iconBg: 'bg-rose-100 text-rose-700',
    accent: 'text-rose-950',
    subText: 'text-rose-800/90',
    badgeBg: 'bg-rose-600 text-white',
    buttonBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
    pingBorder: 'border-rose-300 text-rose-700 hover:bg-rose-100/50',
  },
}

export default function MultiChannelSettings() {
  const { toast } = useToast()
  const [channels, setChannels] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState('priority')
  const [pingStates, setPingStates] = useState({})
  const [isCheckingAll, setIsCheckingAll] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // Initialize channels and saved selection
  useEffect(() => {
    try {
      const auth = getGatewayAuth() || {}
      const lv777 =
        auth.lv777 ||
        auth.maServices ||
        (typeof window !== 'undefined' ? localStorage.getItem('facecheck.lv777') : '') ||
        ''
      const list = buildChannelsFromLv777(lv777)
      const savedId = loadSelectedChannelId()

      setChannels(list)
      setSelectedChannelId(savedId)

      const matched = list.find(channel => channel.id === savedId) || list[0]
      if (matched) {
        setActiveAiHost(matched.url)
      }
      setInitialLoading(false)

      // Auto ping test all channels on initial load
      if (list.length > 0) {
        testAllChannels(list)
      }
    } catch {
      setInitialLoading(false)
    }
  }, [])

  // Test single channel with auto HTTPS fallback
  const testChannelConnection = useCallback(async channel => {
    setPingStates(prev => ({
      ...prev,
      [channel.id]: { loading: true, status: 'idle' },
    }))

    const result = await pingAiChannel(channel.url)

    // If HTTPS fallback succeeded, update channel URL dynamically
    if (result.resolvedUrl && result.resolvedUrl !== channel.url) {
      setChannels(prev =>
        prev.map(ch => (ch.id === channel.id ? { ...ch, url: result.resolvedUrl } : ch))
      )
    }

    setPingStates(prev => ({
      ...prev,
      [channel.id]: {
        loading: false,
        status: result.online ? 'online' : 'offline',
        latency: result.latency,
        error: result.error,
      },
    }))
    return result
  }, [])

  // Test all channels sequentially
  const testAllChannels = useCallback(
    async (channelList = channels) => {
      if (channelList.length === 0) return
      setIsCheckingAll(true)
      for (const ch of channelList) {
        await testChannelConnection(ch)
      }
      setIsCheckingAll(false)
    },
    [channels, testChannelConnection]
  )

  function handleSelectChannel(channel) {
    if (channel.id === selectedChannelId) return
    setSelectedChannelId(channel.id)
    saveSelectedChannelId(channel.id)
    setActiveAiHost(channel.url)
    toast.success(
      `Đã chuyển sang "${channel.title}". Toàn bộ tác vụ nhận diện khuôn mặt và điểm danh sẽ ưu tiên định tuyến qua máy chủ này.`
    )
  }

  const activeChannel = channels.find(c => c.id === selectedChannelId) || channels[0]

  if (initialLoading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-sm flex items-center justify-center gap-3">
        <RefreshCw size={16} className="animate-spin text-blue-600" />
        <span className="text-sm font-medium text-slate-500">Đang tải cấu hình máy chủ AI...</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
      {/* Header matching Mobile MultiChannelSettingsModule */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
            <Server size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Hệ thống đa kênh máy chủ AI
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
              Chuyển đổi linh hoạt giữa các cụm máy chủ xử lý nhận diện. Toàn bộ dữ liệu khuôn mặt tự
              động đồng bộ chéo giữa các máy.
            </p>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span className="text-slate-600 font-medium">Kênh đang kích hoạt:</span>
          <span className="font-bold text-slate-900">
            {activeChannel?.title || 'Máy chủ ưu tiên'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => testAllChannels()}
          disabled={isCheckingAll}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold transition-all shadow-sm disabled:opacity-60"
        >
          <RefreshCw size={13} className={isCheckingAll ? 'animate-spin' : ''} />
          <span>{isCheckingAll ? 'Đang kiểm tra...' : 'Kiểm tra tất cả'}</span>
        </button>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {channels.map(channel => {
          const isSelected = selectedChannelId === channel.id
          const theme = THEME_STYLES[channel.theme] || THEME_STYLES.rose
          const ping = pingStates[channel.id] || { status: 'idle', loading: false }
          const description =
            CHANNEL_DESCRIPTIONS[channel.id] || 'Máy chủ dự phòng nhận diện'

          return (
            <div
              key={channel.id}
              className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between ${
                isSelected ? theme.activeBg : `${theme.bg}`
              }`}
            >
              {/* Card Top: Title & Active Badge */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${theme.iconBg}`}
                    >
                      <Server size={18} />
                    </div>
                    <div>
                      <h3 className={`text-base font-bold tracking-tight ${theme.accent}`}>
                        {channel.title}
                      </h3>
                      <p className={`text-[11.5px] font-medium mt-0.5 leading-snug ${theme.subText}`}>
                        {description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shrink-0 ${theme.badgeBg}`}
                    >
                      <Check size={11} strokeWidth={3} />
                      ĐANG CHỌN
                    </span>
                  )}
                </div>
              </div>

              {/* Status & Action Row */}
              <div className="mt-4 pt-3.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Ping Status */}
                <div className="flex items-center gap-2 text-xs">
                  {ping.loading ? (
                    <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                      <RefreshCw size={12} className="animate-spin text-blue-600" />
                      Đang kiểm tra kết nối...
                    </span>
                  ) : ping.status === 'online' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-semibold text-emerald-700">Đang hoạt động</span>
                      {typeof ping.latency === 'number' && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 font-bold text-[11px]">
                          <Zap size={10} className="fill-emerald-700" />
                          {ping.latency} ms
                        </span>
                      )}
                    </div>
                  ) : ping.status === 'offline' ? (
                    <div
                      className="flex items-center gap-1.5 text-red-600"
                      title={ping.error || 'Mất kết nối'}
                    >
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="font-semibold">Mất kết nối</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span>Chưa kiểm tra</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => testChannelConnection(channel)}
                    disabled={ping.loading}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-white shadow-2xs transition-colors disabled:opacity-50 ${theme.pingBorder}`}
                  >
                    <RefreshCw size={11} className={ping.loading ? 'animate-spin' : ''} />
                    <span>Kiểm tra</span>
                  </button>

                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => handleSelectChannel(channel)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-transform active:scale-95 ${theme.buttonBg}`}
                    >
                      Chọn máy chủ
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
