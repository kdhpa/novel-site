import { isVerifiedGoogleProfile } from '@novelverse/shared';

type AuthEnvironment = Readonly<Record<string, string | undefined>>;

type OpsAccountState = {
  role?: string | null;
  suspendedAt?: Date | string | null;
} | null | undefined;

export function isOpsPasswordLoginEnabled(env: AuthEnvironment = process.env) {
  if (env.NODE_ENV === 'production') {
    return env.OPS_ALLOW_PASSWORD_LOGIN === 'true';
  }
  return true;
}

export function isAllowedOpsGoogleProfile(
  profile: unknown,
  env: AuthEnvironment = process.env,
) {
  if (!isVerifiedGoogleProfile(profile)) return false;
  const requiredDomain = env.OPS_GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase();
  if (!requiredDomain) return true;
  const hostedDomain = (profile as { hd?: unknown }).hd;
  return typeof hostedDomain === 'string' && hostedDomain.toLowerCase() === requiredDomain;
}

export function isAllowedOpsAdminAccount(account: OpsAccountState) {
  return account?.role === 'ADMIN'
    && !account.suspendedAt;
}
