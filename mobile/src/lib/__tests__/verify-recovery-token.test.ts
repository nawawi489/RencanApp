// S2-6: verify-recovery-token unit tests. Covers the cross-project JWT
// substitution vector and the malformed-input surface.

import { decodeJwtPayload, isRecoveryTokenForProject } from '../verify-recovery-token';

// Build a JWT with an arbitrary payload. Header + signature are placeholders
// because we don't verify the signature locally — the server does. What we
// need is a valid base64url payload.
function makeJwt(payload: Record<string, unknown>): string {
  const enc = (obj: unknown) => {
    const json = JSON.stringify(obj);
    // btoa expects binary strings; JSON is ASCII-safe for our claims.
    const b64 = typeof btoa === 'function'
      ? btoa(json)
      : Buffer.from(json, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig`;
}

describe('decodeJwtPayload', () => {
  it('returns claims for a well-formed JWT', () => {
    const t = makeJwt({ iss: 'https://x.supabase.co/auth/v1', sub: 'u1' });
    expect(decodeJwtPayload(t)).toEqual(
      expect.objectContaining({ iss: 'https://x.supabase.co/auth/v1', sub: 'u1' }),
    );
  });

  it('returns null for garbage input', () => {
    expect(decodeJwtPayload('' as string)).toBeNull();
    expect(decodeJwtPayload('not.a.jwt.at.all')).toBeNull();
    expect(decodeJwtPayload('only-one-part')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    // Payload that isn't valid base64.
    expect(decodeJwtPayload('a.!!not-base64!!.c')).toBeNull();
  });

  it('returns null when payload has no iss claim', () => {
    const t = makeJwt({ sub: 'u1' });
    expect(decodeJwtPayload(t)).toBeNull();
  });
});

describe('isRecoveryTokenForProject', () => {
  const projectUrl = 'https://abc.supabase.co';

  it('accepts a token whose iss origin matches our project', () => {
    const t = makeJwt({ iss: 'https://abc.supabase.co/auth/v1', sub: 'u1' });
    expect(isRecoveryTokenForProject(t, projectUrl)).toBe(true);
  });

  it('accepts when amr contains recovery', () => {
    const t = makeJwt({
      iss: 'https://abc.supabase.co/auth/v1',
      amr: [{ method: 'recovery' }],
    });
    expect(isRecoveryTokenForProject(t, projectUrl)).toBe(true);
  });

  it('rejects a token issued by a different Supabase project (cross-project spoof)', () => {
    const t = makeJwt({ iss: 'https://attacker.supabase.co/auth/v1', sub: 'u1' });
    expect(isRecoveryTokenForProject(t, projectUrl)).toBe(false);
  });

  it('rejects a token whose amr lists other methods but not recovery', () => {
    const t = makeJwt({
      iss: 'https://abc.supabase.co/auth/v1',
      amr: [{ method: 'password' }, { method: 'otp' }],
    });
    expect(isRecoveryTokenForProject(t, projectUrl)).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(isRecoveryTokenForProject('bogus', projectUrl)).toBe(false);
    expect(isRecoveryTokenForProject('', projectUrl)).toBe(false);
  });

  it('rejects when supabaseUrl is not a URL', () => {
    const t = makeJwt({ iss: 'https://abc.supabase.co/auth/v1' });
    expect(isRecoveryTokenForProject(t, 'not-a-url')).toBe(false);
  });
});
