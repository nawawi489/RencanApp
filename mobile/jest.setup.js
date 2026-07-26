// Jest setup: mock modul native yang tidak tersedia di Node test runner.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo dipakai `installOnlineManager` (dijalankan saat root _layout dimuat). Mock resmi
// menghindari akses native module di runner + memberi `addEventListener` no-op yang aman.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);
