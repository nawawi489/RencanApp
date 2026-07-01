// Tab Menu (V1.8.2 §7.1 / §31) — hub atas berisi profil, tema, People & People Ranking,
// dan seluruh seksi admin (gated permission). Konten kanonik di ../settings; di-tab-kan ulang di sini.
import SettingsScreen from '../settings';

import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import PrototypeMenuScreen from '@/prototype/screens/menu';

export function LiveMenuScreen() {
  return <SettingsScreen />;
}

export default function MenuRoute() {
  return <TabScreenAdapter live={LiveMenuScreen} prototype={PrototypeMenuScreen} />;
}
