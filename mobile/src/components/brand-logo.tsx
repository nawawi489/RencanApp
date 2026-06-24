import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/** Logo mark Rencanaapp — centang gradient biru→hijau (dari prototype design.html). */
export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Rencanaapp">
      <Defs>
        <LinearGradient id="markBlue" x1="12" y1="8" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#092753" />
          <Stop offset="1" stopColor="#1877f2" />
        </LinearGradient>
        <LinearGradient id="markGreen" x1="24" y1="42" x2="54" y2="24" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#009f72" />
          <Stop offset="1" stopColor="#6ccf43" />
        </LinearGradient>
      </Defs>
      <Path
        d="M15 51V18c0-5 4-9 9-9h18c8 0 12 9 7 15L34 41"
        fill="none"
        stroke="url(#markBlue)"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m22 36 11 11 21-24"
        fill="none"
        stroke="url(#markGreen)"
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Wordmark "Rencana" + "app" hijau — dipakai di login & header. */
export const BRAND_NAME = 'Rencanaapp';
export const BRAND_TAGLINE = 'Rencanakan. Jalankan. Tuntaskan.';
