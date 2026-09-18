import Tts from 'react-native-tts';

const TTS_LANGUAGE = 'vi-VN';
const TTS_RATE = 0.45; // Reverted back to original 0.45 rate
const TTS_PITCH = 1.0;
const TTS_DEDUP_MS = 1200;

let ttsReady: boolean | null = null;
let lastSpokenAt = 0;
let lastSpokenText = '';

function resolveAttendanceUserName(user: any): string {
  return String(
    user?.name
      || user?.employee_name
      || user?.full_name
      || user?.username
      || user?.code
      || '',
  ).trim();
}

export function formatRemainingDurationForTts(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} giây`;
  }
  if (seconds <= 0) {
    return `${String(minutes).padStart(2, '0')} phút`;
  }
  return `${String(minutes).padStart(2, '0')} phút ${String(seconds).padStart(2, '0')} giây`;
}

export async function ensureAttendanceTtsReady(): Promise<boolean> {
  if (ttsReady === true) {
    return true;
  }

  try {
    await Tts.getInitStatus();
    try {
      await Tts.setDefaultLanguage(TTS_LANGUAGE);
    } catch {
      // Fallback to device default language
    }
    Tts.setDefaultRate(TTS_RATE);
    Tts.setDefaultPitch(TTS_PITCH);
    ttsReady = true;
  } catch {
    ttsReady = false;
  }

  return ttsReady === true;
}

// Pre-warm TTS engine immediately upon module load
ensureAttendanceTtsReady().catch(() => {});

export async function speakAttendanceText(text: string): Promise<void> {
  const message = String(text || '').trim();
  if (!message) {
    return;
  }

  const now = Date.now();
  if (message === lastSpokenText && now - lastSpokenAt < TTS_DEDUP_MS) {
    return;
  }
  lastSpokenText = message;
  lastSpokenAt = now;

  // Speak directly without calling Tts.stop() afterwards which interrupts audio playback
  try {
    Tts.stop();
  } catch {}

  Tts.speak(message);

  if (ttsReady !== true) {
    ensureAttendanceTtsReady().catch(() => {});
  }
}

export async function speakAttendanceSuccess(user: any): Promise<void> {
  const name = resolveAttendanceUserName(user);
  await speakAttendanceText(name ? `Xin chào ${name}` : 'Xin chào');
}

export function formatCooldownForTts(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes <= 0) {
    return `Vui lòng thử lại sau ${seconds} giây`;
  }
  return `Vui lòng thử lại sau ${minutes} phút ${seconds} giây`;
}

export async function speakAttendanceCooldown(
  remainingSeconds: number,
): Promise<void> {
  const message = formatCooldownForTts(remainingSeconds);
  await speakAttendanceText(message);
}

export async function speakAttendanceOutcome(outcome: any): Promise<void> {
  if (outcome?.cooldown || outcome?.cooldown_remaining_seconds) {
    const remain = Number(outcome.cooldown_remaining_seconds || 30);
    await speakAttendanceCooldown(remain);
    return;
  }
  if (outcome?.success) {
    await speakAttendanceSuccess(outcome?.user || outcome?.employee);
  }
}

