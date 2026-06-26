// Wrapper expo-document-picker untuk UI-S-AP5.
// Diisolasi di sini agar bisa di-mock di jest tanpa expo-document-picker setup native.
import * as DocumentPicker from 'expo-document-picker';

import type { LocalFile } from './storage';

/** Buka native picker, return list LocalFile siap di-upload. Empty array bila cancelled. */
export async function pickEvidenceFiles(opts?: { max?: number }): Promise<LocalFile[]> {
  const max = opts?.max ?? 5;
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  const assets = res.assets ?? [];
  return assets.slice(0, max).map((a) => ({
    uri: a.uri,
    name: a.name ?? 'file',
    size: a.size ?? 0,
    mimeType: a.mimeType ?? null,
  }));
}
