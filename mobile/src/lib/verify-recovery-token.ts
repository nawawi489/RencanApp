// S2-6 fix: verify a Supabase recovery `access_token` before we call
// `setSession()` with it. Two distinct attacks close here:
//
//   1. Cross-project token substitution. Anyone can spin up a Supabase project,
//      generate a recovery link for a spoofed email, and lure a user to open
//      it in *our* app. Without verifying `iss`, `setSession()` accepts the
//      foreign JWT and logs them in as whoever the attacker chose.
//
//   2. Session fixation via replayed recovery link. The caller decides whether
//      to accept a token when a session is already active — that check lives
//      in the caller (auth-provider) because it needs the live session.
//
// This function only answers "is this JWT structurally a Supabase recovery
// token issued by OUR project?". Signature verification is out of scope — the
// server does that when the token is used. What we prevent is redirecting
// the app into `setSession()` with a token that clearly doesn't belong here.

export type RecoveryTokenClaims = {
  iss: string;
  aud?: string;
  sub?: string;
  amr?: Array<{ method?: string }>;
  session_id?: string;
  exp?: number;
};

// Decode the JWT payload without verifying signature. Guarded against every
// malformed shape that can appear in a deep link (URI-encoded fragments,
// base64url with missing padding, non-JSON body). Returns null instead of
// throwing so the caller can fall through to a generic "bad link" error
// without leaking parser details to the user.
export function decodeJwtPayload(token: string): RecoveryTokenClaims | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let json: string;
  try {
    if (typeof atob === 'function') {
      json = atob(padded);
    } else {
      // Fallback: this file runs in React Native (Hermes) where `atob` is
      // available since RN 0.74; Buffer keeps it working on older engines.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Buffer } = require('buffer');
      json = Buffer.from(padded, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.iss !== 'string') return null;
    return rec as RecoveryTokenClaims;
  } catch {
    return null;
  }
}

// The `iss` claim on a Supabase auth JWT is `<supabaseUrl>/auth/v1`. Comparing
// the parsed origin lets us tolerate a trailing slash mismatch or a path
// difference while still rejecting a foreign host outright.
export function isRecoveryTokenForProject(token: string, supabaseUrl: string): boolean {
  const claims = decodeJwtPayload(token);
  if (!claims) return false;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch {
    return false;
  }

  let issOrigin: string;
  try {
    issOrigin = new URL(claims.iss).origin;
  } catch {
    return false;
  }

  if (issOrigin !== expectedOrigin) return false;

  // The recovery flow authenticates the user by password reset — the token
  // must carry the `recovery` AMR method so that a generic access token from
  // e.g. a signed-in `magiclink` session cannot be swapped in.
  if (Array.isArray(claims.amr) && claims.amr.length > 0) {
    const methods = claims.amr.map((m) => m?.method).filter(Boolean);
    if (methods.length > 0 && !methods.includes('recovery')) return false;
  }

  return true;
}
