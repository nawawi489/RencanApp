// Unit tests untuk lib/storage.ts (UI-S-AP5 file upload helper).
// Tidak menyentuh Supabase nyata: mock supabase.storage + supabase.rpc.
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
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
  CHAT_ALLOWED_MIMES,
  CHAT_FILE_MAX_BYTES,
  CHAT_MAX_ATTACHMENTS,
  FILE_MAX_BYTES,
  buildChatAttachmentPath,
  buildEvidencePath,
  classifyKind,
  cleanupOrphanChatUpload,
  cleanupOrphanUpload,
  getChatAttachmentSignedUrl,
  safeFilename,
  uploadChatAttachment,
  uploadEvidenceFile,
  validateChatAttachmentCount,
  validateChatFile,
  validateFile,
} from '../storage';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockFetchImpl.mockReset();
  mockFrom.mockReturnValue({
    upload: (...a: unknown[]) => mockUpload(...a),
    createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
  });
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
      orgId: 'org-1', taskId: 'ap-2', submissionDraftId: 'sd-3', fileName: 'a b.pdf',
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
      orgId: 'o', taskId: 'a', submissionDraftId: 's',
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
      orgId: 'o', taskId: 'a', submissionDraftId: 's',
      file: { uri: 'file:///x', name: 'x.pdf', size: 1, mimeType: 'application/pdf' },
    })).rejects.toEqual({ message: 'denied' });
  });
  it('[S23] file > 10MB → tolak SEBELUM upload (validateFile fires)', async () => {
    await expect(uploadEvidenceFile({
      orgId: 'o', taskId: 'a', submissionDraftId: 's',
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

// ============================================================
// Chat Attachments — Fase 1: Pure Functions & Constants
// ============================================================

describe('Chat attachment constants (CA-1,2,3)', () => {
  it('[CA-1] CHAT_FILE_MAX_BYTES = 5 MB', () => {
    expect(CHAT_FILE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
  it('[CA-2] CHAT_ALLOWED_MIMES = jpeg, png, webp', () => {
    expect(CHAT_ALLOWED_MIMES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
  it('[CA-3] CHAT_MAX_ATTACHMENTS = 3', () => {
    expect(CHAT_MAX_ATTACHMENTS).toBe(3);
  });
});

describe('validateChatFile (CA-4..10)', () => {
  it('[CA-4] 5 MB boundary → OK', () => {
    expect(() => validateChatFile({ name: 'ok.jpg', size: CHAT_FILE_MAX_BYTES, mimeType: 'image/jpeg' })).not.toThrow();
  });
  it('[CA-5] > 5 MB → throw', () => {
    expect(() => validateChatFile({ name: 'big.jpg', size: CHAT_FILE_MAX_BYTES + 1, mimeType: 'image/jpeg' })).toThrow(/5 MB/);
  });
  it('[CA-6] PDF → throw (MIME not allowed)', () => {
    expect(() => validateChatFile({ name: 'doc.pdf', size: 100, mimeType: 'application/pdf' })).toThrow(/tidak didukung/);
  });
  it('[CA-7] null MIME → throw', () => {
    expect(() => validateChatFile({ name: 'x', size: 100, mimeType: null })).toThrow(/tidak didukung/);
  });
  it('[CA-8] 0 bytes → throw', () => {
    expect(() => validateChatFile({ name: 'empty.jpg', size: 0, mimeType: 'image/jpeg' })).toThrow(/kosong/);
  });
  it('[CA-9] image/webp → OK', () => {
    expect(() => validateChatFile({ name: 'x.webp', size: 100, mimeType: 'image/webp' })).not.toThrow();
  });
  it('[CA-10] image/svg+xml → throw (not in whitelist)', () => {
    expect(() => validateChatFile({ name: 'x.svg', size: 100, mimeType: 'image/svg+xml' })).toThrow(/tidak didukung/);
  });
});

describe('validateChatAttachmentCount (CA-11,12,13)', () => {
  it('[CA-11] 3 → OK (boundary)', () => {
    expect(() => validateChatAttachmentCount(3)).not.toThrow();
  });
  it('[CA-12] 4 → throw', () => {
    expect(() => validateChatAttachmentCount(4)).toThrow(/3 gambar/);
  });
  it('[CA-13] 0 → OK', () => {
    expect(() => validateChatAttachmentCount(0)).not.toThrow();
  });
});

describe('buildChatAttachmentPath (CA-14,15,16)', () => {
  it('[CA-14] format = {org}/{room}/{uuid}-{safe_filename}', () => {
    const p = buildChatAttachmentPath({ orgId: 'org-1', roomId: 'room-2', fileName: 'foto rapat.jpg' });
    expect(p).toMatch(/^org-1\/room-2\/[0-9a-f-]+-foto_rapat\.jpg$/);
  });
  it('[CA-15] no bucket prefix', () => {
    const p = buildChatAttachmentPath({ orgId: 'o', roomId: 'r', fileName: 'x.png' });
    expect(p.startsWith('chat-attachments/')).toBe(false);
  });
  it('[CA-16] path has >= 3 segments', () => {
    const p = buildChatAttachmentPath({ orgId: 'o', roomId: 'r', fileName: 'x.png' });
    expect(p.split('/').length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// Fase 2: Storage Operations (mocked)
// ============================================================

describe('uploadChatAttachment (step 10-11)', () => {
  it('success → returns {path, mimeType}; uses chat-attachments bucket', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'ignored' }, error: null });
    const res = await uploadChatAttachment({
      orgId: 'o', roomId: 'r',
      file: { uri: 'file:///tmp/x.jpg', name: 'x.jpg', size: 100, mimeType: 'image/jpeg' },
    });
    expect(mockFrom).toHaveBeenCalledWith('chat-attachments');
    expect(mockUpload).toHaveBeenCalled();
    expect(res.path.startsWith('o/r/')).toBe(true);
    expect(res.mimeType).toBe('image/jpeg');
  });
  it('storage error → throw', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(uploadChatAttachment({
      orgId: 'o', roomId: 'r',
      file: { uri: 'file:///x', name: 'x.jpg', size: 1, mimeType: 'image/jpeg' },
    })).rejects.toEqual({ message: 'denied' });
  });
  it('pre-upload validation rejects > 5MB before upload', async () => {
    await expect(uploadChatAttachment({
      orgId: 'o', roomId: 'r',
      file: { uri: 'file:///x', name: 'big.jpg', size: CHAT_FILE_MAX_BYTES + 1, mimeType: 'image/jpeg' },
    })).rejects.toThrow(/5 MB/);
    expect(mockUpload).not.toHaveBeenCalled();
  });
  it('pre-upload validation rejects bad MIME before upload', async () => {
    await expect(uploadChatAttachment({
      orgId: 'o', roomId: 'r',
      file: { uri: 'file:///x', name: 'x.pdf', size: 100, mimeType: 'application/pdf' },
    })).rejects.toThrow(/tidak didukung/);
    expect(mockUpload).not.toHaveBeenCalled();
  });
  it('[15a] passes contentType in upload options', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'ok' }, error: null });
    await uploadChatAttachment({
      orgId: 'o', roomId: 'r',
      file: { uri: 'file:///x', name: 'x.png', size: 100, mimeType: 'image/png' },
    });
    const uploadArgs = mockUpload.mock.calls[0];
    expect(uploadArgs[2]).toEqual(expect.objectContaining({ contentType: 'image/png' }));
  });
});

describe('cleanupOrphanChatUpload (step 12-13)', () => {
  it('calls RPC cleanup_orphan_chat_upload({p_path})', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await cleanupOrphanChatUpload('o/r/uuid-x.jpg');
    expect(mockRpc).toHaveBeenCalledWith('cleanup_orphan_chat_upload', { p_path: 'o/r/uuid-x.jpg' });
  });
  it('error → throw', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'forbid' } });
    await expect(cleanupOrphanChatUpload('p')).rejects.toEqual({ message: 'forbid' });
  });
});

describe('getChatAttachmentSignedUrl (step 14-15)', () => {
  it('default TTL 600s (S8-2 dinaikkan dari 60s) — layar chat menahan bubble >60s tanpa refetch', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://x/signed' }, error: null });
    const url = await getChatAttachmentSignedUrl('o/r/uuid-x.jpg');
    expect(mockFrom).toHaveBeenCalledWith('chat-attachments');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('o/r/uuid-x.jpg', 600);
    expect(url).toBe('https://x/signed');
  });
  it('opts.transform diteruskan ke createSignedUrl utk varian thumbnail', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://x/thumb' }, error: null });
    const url = await getChatAttachmentSignedUrl('o/r/uuid-x.jpg', {
      transform: { width: 440, height: 330, resize: 'cover' },
    });
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('o/r/uuid-x.jpg', 600, {
      transform: { width: 440, height: 330, resize: 'cover' },
    });
    expect(url).toBe('https://x/thumb');
  });
  it('opts.ttlSec override menang atas default', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://x/short' }, error: null });
    await getChatAttachmentSignedUrl('p', { ttlSec: 30 });
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('p', 30);
  });
  it('error → throw', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await expect(getChatAttachmentSignedUrl('p')).rejects.toEqual({ message: 'nope' });
  });
});
