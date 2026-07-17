type ProxyAuthRedirectInput = {
  pathname: string;
  search: string;
  isLoggedIn: boolean;
  role?: string;
};

const protectedPatterns = [
  /^\/library(?:\/.*)?$/,
  /^\/dashboard(?:\/.*)?$/,
  /^\/novels\/new\/?$/,
  /^\/novels\/[^/]+\/edit\/?$/,
  /^\/novels\/[^/]+\/chapters(?:\/.*)?$/,
  /^\/novels\/[^/]+\/characters(?:\/.*)?$/,
  /^\/settings(?:\/.*)?$/,
];
const adminPatterns = [/^\/admin(?:\/.*)?$/];
const authPatterns = [/^\/login\/?$/, /^\/register\/?$/];

/**
 * Auth.js invokes a custom proxy handler even when `authorized` returned
 * false. Keep the same route boundary here so adding nonce headers cannot
 * bypass the existing authentication proxy behavior.
 */
export function getProxyAuthRedirectTarget(input: ProxyAuthRedirectInput) {
  const isAdminPath = adminPatterns.some((pattern) => pattern.test(input.pathname));
  const requiresLogin = protectedPatterns.some((pattern) => pattern.test(input.pathname))
    || isAdminPath;

  if (requiresLogin && !input.isLoggedIn) {
    const callbackUrl = `${input.pathname}${input.search}`;
    return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  if (isAdminPath && input.role !== 'ADMIN') return '/';

  if (input.isLoggedIn && authPatterns.some((pattern) => pattern.test(input.pathname))) {
    return '/';
  }

  return null;
}
