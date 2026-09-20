/**
 * Text-to-Speech (TTS) Service for Desktop Attendance
 * Speaks natural, fluent greeting announcements in Vietnamese:
 * e.g. "Xin chào Lương Ngọc Chung. Quét mặt thành công!"
 *
 * Architecture:
 * 1. Primary: CovaVision Backend TTS proxy (high-fidelity natural Vietnamese audio via Google TTS, cached).
 * 2. Secondary: Direct Google TTS URL (when in Electron environment).
 * 3. Tertiary: Native SpeechSynthesis ONLY if a true Vietnamese voice is installed.
 *    (Never falls back to an English voice to avoid character spelling / đánh vần).
 * 4. Fallback: Pleasant Web Audio chime ding if audio synthesis is completely unreachable.
 */

import { getApiBase } from './connectionTarget'

let lastSpokenText = ''
let lastSpokenAt = 0
let activeAudio = null

export function isTtsSupported() {
  return typeof window !== 'undefined'
}

export function getVietnameseVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices() || []
  return (
    voices.find(v => v.lang === 'vi-VN' || v.lang === 'vi_VN' || v.lang.toLowerCase().startsWith('vi')) ||
    null
  )
}

function playFallbackChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, now) // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15) // A5
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.35)
  } catch {
    // Ignore audio context errors
  }
}

function stopCurrentSpeech() {
  if (activeAudio) {
    try {
      activeAudio.pause()
      activeAudio.currentTime = 0
    } catch {}
    activeAudio = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {}
  }
}

function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    activeAudio = audio
    audio.onended = () => {
      activeAudio = null
      resolve()
    }
    audio.onerror = err => {
      activeAudio = null
      reject(err)
    }
    audio.play().catch(reject)
  })
}

export async function speakText(text, options = {}) {
  const normText = String(text || '').trim()
  if (!normText || typeof window === 'undefined') return

  const now = Date.now()
  if (lastSpokenText === normText && now - lastSpokenAt < 3000) {
    return
  }
  lastSpokenText = normText
  lastSpokenAt = now

  stopCurrentSpeech()

  // 1. Try Backend TTS audio endpoint (natural fluent Vietnamese, cached)
  try {
    const apiBase = getApiBase() || 'http://127.0.0.1:8000'
    const backendTtsUrl = `${apiBase}/api/v1/tts?text=${encodeURIComponent(normText)}&lang=vi`
    await playAudioUrl(backendTtsUrl)
    return
  } catch {
    // Backend TTS failed or offline, proceed to fallbacks
  }

  // 2. Try direct Google TTS URL (works in Electron)
  try {
    const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(normText)}&tl=vi&client=tw-ob`
    await playAudioUrl(directUrl)
    return
  } catch {
    // Direct Google TTS failed
  }

  // 3. Try Native SpeechSynthesis ONLY if a genuine Vietnamese voice exists
  const viVoice = getVietnameseVoice()
  if (viVoice && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(normText)
      utterance.voice = viVoice
      utterance.lang = viVoice.lang || 'vi-VN'
      utterance.rate = options.rate || 1.05
      utterance.pitch = options.pitch || 1.0
      window.speechSynthesis.speak(utterance)
      return
    } catch {}
  }

  // 4. Do NOT use an English voice to spell out Vietnamese letters ("X-I-N C-H-A-O")!
  // Instead, play a pleasant chime tone.
  playFallbackChime()
}

export function speakAttendanceOutcome(userName, attendanceType = 'IN', isLate = false) {
  const name = String(userName || '').trim()
  if (!name) return

  let sentence
  if (isLate) {
    sentence = `Xin chào ${name}. Bạn đã được ghi nhận vào ca làm việc!`
  } else {
    sentence = `Xin chào ${name}. Quét mặt thành công!`
  }

  void speakText(sentence)
}
