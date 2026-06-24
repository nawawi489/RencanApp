import Svg, { Circle } from 'react-native-svg';
import { Text, View } from 'react-native-css/components';

/** Ring capaian (mis. 68%) untuk Action Plan / KPI detail. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  tone = 'brand',
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'brand' | 'success' | 'warn';
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const color = tone === 'success' ? '#15803d' : tone === 'warn' ? '#b45309' : '#1564b3';
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text className="text-sm font-extrabold text-black dark:text-white">{pct}%</Text>
    </View>
  );
}
