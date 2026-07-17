export function isSessionInvalidatedByPasswordChange(
  sessionIssuedAt: unknown,
  passwordChangedAt: Date | null | undefined,
) {
  if (!passwordChangedAt) return false;
  return typeof sessionIssuedAt !== 'number'
    || !Number.isFinite(sessionIssuedAt)
    || sessionIssuedAt < passwordChangedAt.getTime();
}

export function isCredentialAuthenticationAllowed(input: {
  userExists: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
  accountActive: boolean;
  passwordWithinLimit: boolean;
  passwordValid: boolean;
}) {
  return input.userExists
    && input.hasPassword
    && input.emailVerified
    && input.accountActive
    && input.passwordWithinLimit
    && input.passwordValid;
}
