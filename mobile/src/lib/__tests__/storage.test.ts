// Unit tests untuk lib/storage.ts (UI-S-AP5 file upload helper).
// Tidak menyentuh Supabase nyata: mock supabase.storage + supabase.rpc.
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockFetchImpl = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    storage: { from: (...a: unknown[]) => mockFrom(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// Mock global fetch (untuk konversi URI → blob)
beforeAll(() => {
  // Ganti global fetch dgn mock (test environment).
  (global as { fetch?: unknown }).fetch = (...a: unknown[]) => mockFetchImpl(...a);
});

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  BATCH_MAX_BYTES,
  FILE_MAX_BYTES,
  FILE_MAX_COUNT,
  buildEvidencePath,
  classifyKind,
  cleanupOrphanUpload,
  safeFilename,
  uploadEvidenceFile,
  validateBatch,
  validateFile,
} from '../storage';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockUpload.mockReset();
  mockFetchImpl.mockReset();
  mockFrom.mockReturnValue({ upload: (...a: unknown[]) => mockUpload(...a) });
  mockFetchImpl.mockResolvedValue({ blob: async () => 'blob-fake' });
});

describe('classifyKind (ER-6 deterministic MIME mapping)', () => {
  it('[S1] image/jpeg → photo', () => expect(classifyKind('image/jpeg')).toBe('photo'));
  it('[S2] image/png → photo', () => expect(classifyKind('image/png')).toBe('photo'));
  it('[S3] image/heic → photo (semua image/* → photo)', () => expect(classifyKind('image/heic')).toBe('photo'));
  it('[S4] image/svg+xml → photo', () => expect(classifyKind('image/svg+xml')).toBe('photo'));
  it('[S5] application/pdf → pdf', () => expect(classifyKind('application/pdf')).toBe('pdf'));
  it('[S6] application/octet-stream → file (fallback)', () => expect(classifyKind('application/octet-stream')).toBe('file'));
  it('[S7] mime undefined → file', () => expect(classifyKind(undefined)).toBe('file'));
  it('[S8] mime null → file', () => expect(classifyKind(null)).toBe('file'));
});

describe('validateFile (FILE_MAX_BYTES = 10MB)', () => {
  it('[S9] ukuran = 10MB tepat → OK (boundary)', () => {
    expect(() => validateFile({ name: 'ok.pdf', size: FILE_MAX_BYTES })).not.toThrow();
  });
  it('[S10] ukuran > 10MB → throw "melebihi 10 MB"', () => {
    expect(() => validateFile({ name: 'big.pdf', size: FILE_MAX_BYTES + 1 })).toThrow(/melebihi.*10 MB/);
  });
});

describe('validateBatch (OD-2 cap + OQ-3 total)', () => {
  it('[S11] 5 file ringan → OK (cap exact)', () => {
    expect(() => validateBatch(Array.from({ length: FILE_MAX_COUNT }, (_, i) => ({ name: 'f' + i, size: 100 })))).not.toThrow();
  });
  it('[S12] 6 file → throw "Maksimum 5"', () => {
    expect(() => validateBatch(Array.from({ length: 6 }, () => ({ name: 'x', size: 1 })))).toThrow(/Maksimum 5/);
  });
  it('[S13] total > 25MB → throw "Total ukuran melebihi 25 MB"', () => {
    const huge = Array.from({ length: 4 }, () => ({ name: 'x', size: 7 * 1024 * 1024 })); // 28 MB total
    expect(() => validateBatch(huge)).toThrow(/Total.*25 MB/);
  });
  it('[S14] total = 25MB tepat → OK (boundary)', () => {
    expect(() => validateBatch([{ name: 'x', size: BATCH_MAX_BYTES }])).not.toThrow();
  });
});

describe('safeFilename', () => {
  it('[S15] spasi → underscore', () => expect(safeFilename('foto rapat 12.png')).toBe('foto_rapat_12.png'));
  it('[S16] slash → underscore', () => expect(safeFilename('a/b/c.pdf')).toBe('a_b_c.pdf'));
  it('[S17] karakter terlarang Windows hilang/ganti', () => {
    expect(safeFilename('a:b*c?d"e<f>g|h.pdf')).toBe('a_b_c_d_e_f_g_h.pdf');
  });
  it('[S18] string kosong → "file"', () => expect(safeFilename('')).toBe('file'));
  it('[S19] truncate ke 100 char', () => {
    const long = 'a'.repeat(200) + '.pdf';
    expect(safeFilename(long).length).toBeLessThanOrEqual(100);
  });
});

describe('buildEvidencePath', () => {
  it('[S20] path = {org}/{ap}/{draft}/{uuid}-{safe}; tidak ada prefix bucket', () => {
    const p = buildEvidencePath({
      orgId: 'org-1', actionPlanId: 'ap-2', submissionDraftId: 'sd-3', fileName: 'a b.pdf',
    });
    expect(p.startsWith('org-1/ap-2/sd-3/')).toBe(true);
    expect(p.endsWith('-a_b.pdf')).toBe(true);
    expect(p.startsWith('evidence/')).toBe(false); // bucket name TIDAK di path
  });
});

describe('uploadEvidenceFile', () => {
  it('[S21] upload sukses → return {path, mimeType}; supabase.storage.from("evidence").upload dipanggil', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'ignored' }, error: null });
    const res = await uploadEvidenceFile({
      orgId: 'o', actionPlanId: 'a', submissionDraftId: 's',
      file: { uri: 'file:///tmp/x.pdf', name: 'x.pdf', size: 100, mimeType: 'application/pdf' },
    });
    expect(mockFrom).toHaveBeenCalledWith('evidence');
    expect(mockUpload).toHaveBeenCalled();
    expect(res.path.startsWith('o/a/s/')).toBe(true);
    expect(res.mimeType).toBe('application/pdf');
  });
  it('[S22] error dari storage → throw', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(uploadEvidenceFile({
      orgId: 'o', actionPlanId: 'a', submissionDraftId: 's',
      file: { uri: 'file:///x', name: 'x.pdf', size: 1, mimeType: 'application/pdf' },
    })).rejects.toEqual({ message: 'denied' });
  });
  it('[S23] file > 10MB → tolak SEBELUM upload (validateFile fires)', async () => {
    await expect(uploadEvidenceFile({
      orgId: 'o', actionPlanId: 'a', submissionDraftId: 's',
      file: { uri: 'file:///x', name: 'big.pdf', size: FILE_MAX_BYTES + 1, mimeType: 'application/pdf' },
    })).rejects.toThrow(/melebihi.*10 MB/);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('cleanupOrphanUpload', () => {
  it('[S24] memanggil RPC cleanup_orphan_upload({p_path})', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await cleanupOrphanUpload('o/a/s/uuid-x.pdf');
    expect(mockRpc).toHaveBeenCalledWith('cleanup_orphan_upload', { p_path: 'o/a/s/uuid-x.pdf' });
  });
  it('[S25] error → throw (propagate)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'forbid' } });
    await expect(cleanupOrphanUpload('p')).rejects.toEqual({ message: 'forbid' });
  });
});
