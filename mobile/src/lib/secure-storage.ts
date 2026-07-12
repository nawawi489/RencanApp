import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase auth storage adapter: expo-secure-store on native (encrypted keychain/keystore),
 * AsyncStorage on web (no SecureStore support). Implements the same interface Supabase expects.
 */
export const secureStorage = Platform.OS === 'web'
  ? AsyncStorage
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };
