// Fixed messages for sign-in and sign-up failures (#757). The Supabase auth
// error text is never sent to the browser: it is mapped by error code to a
// message a resident can act on, and anything unexpected is logged on the
// server and answered with a general message.

type AuthError = { code?: string | null; message?: string | null };

export const LOGIN_FAILED = 'Sign-in failed. Please try again.';
export const INVALID_CREDENTIALS = 'Invalid email or password.';
export const EMAIL_NOT_CONFIRMED = 'Confirm your email address before signing in.';
export const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a minute and try again.';

export const REGISTER_FAILED = 'The account could not be created. Please try again.';
export const EMAIL_EXISTS = 'An account with this email already exists.';
export const WEAK_PASSWORD = 'Password is too weak. Try a longer password.';
export const INVALID_EMAIL = 'Enter a valid email address.';

export const UNEXPECTED_ERROR = 'Something went wrong. Please try again.';

const RATE_LIMIT_CODES = new Set(['over_request_rate_limit', 'over_email_send_rate_limit']);

function logUnexpected(step: string, error: AuthError): void {
  console.error(`${step} failed (${error.code ?? 'no code'}): ${error.message ?? 'no message'}`);
}

export function loginErrorMessage(error: AuthError): string {
  if (error.code === 'invalid_credentials') return INVALID_CREDENTIALS;
  if (error.code === 'email_not_confirmed') return EMAIL_NOT_CONFIRMED;
  if (error.code && RATE_LIMIT_CODES.has(error.code)) return TOO_MANY_ATTEMPTS;
  logUnexpected('Sign-in', error);
  return LOGIN_FAILED;
}

export function registerErrorMessage(error: AuthError): string {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return EMAIL_EXISTS;
  if (error.code === 'weak_password') return WEAK_PASSWORD;
  if (error.code === 'email_address_invalid') return INVALID_EMAIL;
  if (error.code && RATE_LIMIT_CODES.has(error.code)) return TOO_MANY_ATTEMPTS;
  logUnexpected('Sign-up', error);
  return REGISTER_FAILED;
}

// For a thrown error (a bad request body, a network failure). Logged by name
// and message only.
export function unexpectedErrorMessage(step: string, error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'non-Error value thrown';
  console.error(`${step} failed: ${message}`);
  return UNEXPECTED_ERROR;
}
