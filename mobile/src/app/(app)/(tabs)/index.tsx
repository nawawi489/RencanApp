import LiveHomeScreen from '@/live/tabs/home-screen';
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import PrototypeHomeScreen from '@/prototype/screens/home';

export default function HomeRoute() {
  return <TabScreenAdapter live={LiveHomeScreen} prototype={PrototypeHomeScreen} />;
}
