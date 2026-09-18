export type CaptchaData = {
  i: string;
  k: string;
  v: string;
  s: number;
};

// Base64 Polyfills cho React Native
const charsB64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function decodeBase64(v: string): string {
  let decoded = '';
  let i = 0;
  const b64 = v.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < b64.length) {
    const enc1 = charsB64.indexOf(b64[i++]);
    const enc2 = charsB64.indexOf(b64[i++]);
    const enc3 = charsB64.indexOf(b64[i++]);
    const enc4 = charsB64.indexOf(b64[i++]);
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    decoded += String.fromCharCode(chr1);
    if (enc3 !== 64) decoded += String.fromCharCode(chr2);
    if (enc4 !== 64) decoded += String.fromCharCode(chr3);
  }
  return decoded;
}

export function encodeBase64(str: string): string {
  let b64 = '';
  for (
    let block = 0, charCode, i = 0, map = charsB64;
    str.charAt(i | 0) || ((map = '='), i % 1);
    b64 += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
  ) {
    charCode = str.charCodeAt((i += 3 / 4));
    block = (block << 8) | charCode;
  }
  return b64;
}

export function decodeCaptchaToken(token: string): number {
  if (!token) return 0;
  try {
    const decoded = decodeBase64(token);
    const searchStr = 'SOFVinh|';
    const index = decoded.indexOf(searchStr);
    if (index !== -1) {
      const parts = decoded.substring(index + searchStr.length).split('|');
      return parseInt(parts[0], 10);
    }
    return 0;
  } catch {
    return 0;
  }
}

export function generateSignature(x: number, serverTimestamp: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 4; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  const rawSignature = `${salt}SOFDev|${x}|${serverTimestamp}`;
  return encodeBase64(rawSignature);
}
