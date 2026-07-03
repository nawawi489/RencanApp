import { Stack } from 'expo-router';

// WSA-19 — nested stack tab Workspace: hub (index) + pane deep-linkable (performance/development).
// initialRouteName index → deep-link langsung ke pane tetap punya hub sebagai anchor (back → hub).
// headerShown false: header tab (AppHeader) + PaneTopHeader in-content sudah menangani chrome.
export const unstable_settings = { initialRouteName: 'index' };

export default function WorkspaceStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
