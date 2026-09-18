/**
 * Text-to-Speech (TTS) Service for Desktop Attendance (mirrors mobile attendanceTts)
 * Speaks friendly greeting announcements in Vietnamese:
 * e.g. "Xin chào Nguyễn Văn A, chúc bạn một ngày làm việc vui vẻ!"
 */

let lastSpokenText = ''
let lastSpokenAt = 0

export function isTtsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function getVietnameseVoice() {
  if (!isTtsSupported()) return null
  const voices = window.speechSynthesis.getVoices() || []
  return (
    voices.find(v => v.lang === 'vi-VN' || v.lang === 'vi_VN' || v.lang.startsWith('vi')) ||
    null
  )
}

export function speakText(text, options = {}) {
  if (!isTtsSupported() || !text) return

  const now = Date.now()
  if (lastSpokenText === text && now - lastSpokenAt < 4000) {
    return
  }
  lastSpokenText = text
  lastSpokenAt = now

  try {
    window.speechSynthesis.cancel() // Stop any previous ongoing speech
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'vi-VN'
    utterance.rate = options.rate || 1.05
    utterance.pitch = options.pitch || 1.0

    const voice = getVietnameseVoice()
    if (voice) {
      utterance.voice = voice
    }

    window.speechSynthesis.speak(utterance)
  } catch {
    // Ignore TTS errors gracefully
  }
}

export function speakAttendanceOutcome(userName, attendanceType = 'IN', isLate = false) {
  const name = String(userName || '').trim()
  if (!name) return

  const isCheckOut = String(attendanceType).toUpperCase() === 'OUT'
  let sentence = ''

  if (isCheckOut) {
    sentence = `Tạm biệt ${name}. Cảm ơn bạn và hẹn gặp lại!`
  } else if (isLate) {
    sentence = `Xin chào ${name}. Bạn đã được ghi nhận vào ca làm việc!`
  } else {
    sentence = `Xin chào ${name}. Chúc bạn một ngày làm việc vui vẻ và hiệu quả!`
  }

  speakText(sentence)
}
