// AC-RESET: Deep link dari email "Lupa password" bawa access_token + refresh_token
// via URL fragment ("#access_token=…&refresh_token=…&type=recovery"). Supabase RN
// client dikonfigurasi `detectSessionInUrl: false` (default), jadi parsing manual.
// Test ini mengunci pure parser sebelum wiring ke Linking listener.

import { parseRecoveryUrl } from '../parse-recovery-url';

describe('parseRecoveryUrl', () => {
  it('extract access_token & refresh_token dari URL fragment dengan type=recovery', () => {
    const url =
      'ems://reset-password#access_token=abc.def.ghi&refresh_token=rrr&type=recovery&expires_in=3600';
    expect(parseRecoveryUrl(url)).toEqual({
      accessToken: 'abc.def.ghi',
      refreshToken: 'rrr',
    });
  });

  it('mendukung fragment yang datang lewat query string (?…) juga', () => {
    const url =
      'ems://reset-password?access_token=abc&refresh_token=rrr&type=recovery';
    expect(parseRecoveryUrl(url)).toEqual({ accessToken: 'abc', refreshToken: 'rrr' });
  });

  it('return null bila type bukan recovery (mis. signup / magiclink)', () => {
    const url = 'ems://reset-password#access_token=abc&refresh_token=rrr&type=signup';
    expect(parseRecoveryUrl(url)).toBeNull();
  });

  it('return null bila salah satu token hilang', () => {
    expect(parseRecoveryUrl('ems://reset-password#access_token=abc&type=recovery')).toBeNull();
    expect(parseRecoveryUrl('ems://reset-password#refresh_token=rrr&type=recovery')).toBeNull();
  });

  it('return null untuk URL null / kosong / bukan deep link recovery', () => {
    expect(parseRecoveryUrl(null)).toBeNull();
    expect(parseRecoveryUrl('')).toBeNull();
    expect(parseRecoveryUrl('ems://home')).toBeNull();
    expect(parseRecoveryUrl('not-a-url')).toBeNull();
  });
});
