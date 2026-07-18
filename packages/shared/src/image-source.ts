const LOCAL_IMAGE_PREFIXES = ['/uploads/', '/assets/'] as const;
const PROFILE_PROVIDER_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'avatars.githubusercontent.com',
]);

export function getConfiguredImageHosts() {
  const hosts = new Set<string>();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port) {
        hosts.add(url.hostname.toLowerCase());
      }
    } catch {
      // Server startup validation reports malformed deployment configuration.
    }
  }

  for (const value of (process.env.NEXT_PUBLIC_IMAGE_HOSTS || '').split(',')) {
    const host = value.trim().toLowerCase();
    if (host && !/[/:]/.test(host)) hosts.add(host);
  }
  return hosts;
}

function isSafeLocalImagePath(source: string) {
  return LOCAL_IMAGE_PREFIXES.some((prefix) => source.startsWith(prefix)) &&
    !source.includes('..') &&
    !source.includes('\\') &&
    !/[?#]/.test(source) &&
    !/%(?:2e|2f|5c)/i.test(source);
}

function hasAllowedHttpsHost(source: string, hosts: ReadonlySet<string>) {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isAllowedStoredImageSource(source: string | null | undefined) {
  if (!source) return false;
  return isSafeLocalImagePath(source) || hasAllowedHttpsHost(source, getConfiguredImageHosts());
}

export function isAllowedProfileImageSource(source: string | null | undefined) {
  if (!source) return false;
  if (isAllowedStoredImageSource(source)) return true;
  return hasAllowedHttpsHost(source, PROFILE_PROVIDER_HOSTS);
}

export function isOptimizableImageSource(source: string | null | undefined) {
  if (!source) return false;
  if (isSafeLocalImagePath(source) || source.startsWith('/')) return true;
  return hasAllowedHttpsHost(source, new Set([
    ...PROFILE_PROVIDER_HOSTS,
    ...getConfiguredImageHosts(),
  ]));
}
