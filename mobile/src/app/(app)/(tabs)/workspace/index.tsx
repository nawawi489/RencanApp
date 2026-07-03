import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';
import { HubScreen } from '@/screens/workspace-screen';

// Route index `/workspace` — Hub (lobby). Prototype adapter dipertahankan di level hub.
export default function WorkspaceIndexRoute() {
  return <TabScreenAdapter live={HubScreen} prototype={PrototypeWorkspaceScreen} />;
}
