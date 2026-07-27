# Universal Links / App Links well-known files

Files here are the templates for the deep-link verification documents that
must be published under the app's domain so iOS and Android accept
`https://staging.rencanapp.com/reset-password` (and the production host) as
verified handlers for the app.

Sprint 2 · S2-7 — moves the Supabase password-recovery `redirectTo` off the
unverified `ems://` scheme (which any Android app can claim) onto a verified
HTTPS host.

## Where they must be served

Both files must be reachable at the domain's `/.well-known/` prefix over
HTTPS with `Content-Type: application/json`, no redirects, no auth:

| File | URL |
| --- | --- |
| `apple-app-site-association` | `https://staging.rencanapp.com/.well-known/apple-app-site-association` |
| `assetlinks.json` | `https://staging.rencanapp.com/.well-known/assetlinks.json` |

The same pair must exist under `rencanapp.com` before the production build
verifies. iOS is aggressive about caching AASA — expect a 24h delay after the
first publish before Universal Links start working on installed builds.

## What still needs owner action

1. **Replace `APPLE_TEAM_ID`** in `apple-app-site-association` with the
   real 10-character Apple team ID (Xcode → Signing → Team, or App Store
   Connect → Membership).
2. **Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`** in `assetlinks.json`
   with the SHA-256 fingerprint of the Play App Signing certificate. Fetch
   it with:

   ```bash
   eas credentials --platform android
   # → look at "Play App Signing" fingerprint.
   ```

   If you sign with a self-managed keystore too, add its SHA-256 as a second
   entry in the `sha256_cert_fingerprints` array.
3. **Publish** — the Cloudflare Worker that proxies `staging.rencanapp.com`
   to EAS Hosting must pass through `/.well-known/*` paths untouched. The
   simplest publish path is to attach these two files as Worker assets or as
   R2/KV-backed responses. Confirm with `curl -I` that both URLs return
   `200 OK` and `Content-Type: application/json`.
4. **Verify** — after publish:
   - iOS: install a TestFlight build, request a password reset, tap the
     email link. It should open the app directly rather than showing a
     browser prompt.
   - Android: `adb shell pm verify-app-links --re-verify com.rencanapp.mobile`
     then `adb shell pm get-app-links com.rencanapp.mobile` — every host
     should show `verified`.

## Rollback

If verification fails and needs to be turned off in a hurry, delete these
files at the CDN and remove `associatedDomains` (iOS) / the `intentFilters`
block (Android) from `mobile/app.json`. `EXPO_PUBLIC_APP_LINK_HOST` can be
unset so the `login.tsx` fallback returns to `ems://` deep links.
