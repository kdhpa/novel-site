export function normalizeNfkcTrim(value: string) {
  return value.normalize('NFKC').trim();
}

export function foldAsciiCase(value: string) {
  return value.replace(/[A-Z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32));
}

export function normalizeAsciiCaseKey(value: string) {
  return foldAsciiCase(normalizeNfkcTrim(value));
}

export function normalizeIdentityEmail(value: string) {
  return normalizeAsciiCaseKey(value);
}

export function normalizeNicknameDisplay(value: string) {
  return normalizeNfkcTrim(value);
}

export function normalizeNicknameKey(value: string) {
  return foldAsciiCase(normalizeNicknameDisplay(value));
}

export function normalizeTagKey(value: string) {
  return normalizeAsciiCaseKey(value);
}

function boundedNickname(value: string) {
  const normalized = normalizeNicknameDisplay(value).replace(/\s+/gu, ' ');
  const candidate = normalized.length >= 2 ? normalized : '사용자';
  return candidate.slice(0, 20).trimEnd();
}

export function buildOAuthNicknameCandidates(input: {
  name?: string | null;
  email: string;
  userId: string;
}) {
  const localPart = normalizeIdentityEmail(input.email).split('@', 1)[0] || '사용자';
  const base = boundedNickname(input.name || localPart);
  const suffix = input.userId.replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'account';
  const suffixed = `${base.slice(0, Math.max(2, 19 - suffix.length))}-${suffix}`.slice(0, 20);
  const idFallback = `user-${input.userId.replace(/[^A-Za-z0-9]/g, '').slice(-15)}`.slice(0, 20);
  return [...new Set([base, suffixed, idFallback])];
}
