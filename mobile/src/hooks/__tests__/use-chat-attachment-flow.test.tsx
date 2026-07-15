import { renderHook } from '@testing-library/react-native';

const mockUploadChatAttachment = jest.fn();
const mockCleanupOrphanChatUpload = jest.fn();
const mockValidateChatFile = jest.fn();
const mockValidateChatAttachmentCount = jest.fn();

jest.mock('@/lib/storage', () => ({
  uploadChatAttachment: (...a: unknown[]) => mockUploadChatAttachment(...a),
  cleanupOrphanChatUpload: (...a: unknown[]) => mockCleanupOrphanChatUpload(...a),
  validateChatFile: (...a: unknown[]) => mockValidateChatFile(...a),
  validateChatAttachmentCount: (...a: unknown[]) => mockValidateChatAttachmentCount(...a),
}));

jest.mock('@/lib/inbox', () => ({}));

// eslint-disable-next-line import/first
import { useChatAttachmentFlow, type ChatAttachmentFlowInput } from '../use-chat-attachment-flow';

const mockSend = jest.fn();

function makeInput(overrides?: Partial<ChatAttachmentFlowInput>): ChatAttachmentFlowInput {
  return {
    orgId: 'org-1',
    roomId: 'room-1',
    body: 'lihat gambar',
    mentions: [],
    files: [
      { uri: 'file:///tmp/a.jpg', name: 'a.jpg', size: 100, mimeType: 'image/jpeg' },
    ],
    send: mockSend,
    ...overrides,
  };
}

beforeEach(() => {
  mockUploadChatAttachment.mockReset();
  mockCleanupOrphanChatUpload.mockReset();
  mockValidateChatFile.mockReset();
  mockValidateChatAttachmentCount.mockReset();
  mockSend.mockReset();
  mockSend.mockResolvedValue('m-new');
  mockUploadChatAttachment.mockResolvedValue({ path: 'org-1/room-1/uuid-a.jpg', mimeType: 'image/jpeg' });
  mockCleanupOrphanChatUpload.mockResolvedValue(undefined);
});

describe('useChatAttachmentFlow', () => {
  it('[AF-1] happy path: validate → upload → send with attachments → return msgId', async () => {
    const { result } = await renderHook(() => useChatAttachmentFlow());
    const msgId = await result.current.run(makeInput());

    expect(mockValidateChatAttachmentCount).toHaveBeenCalledWith(1);
    expect(mockValidateChatFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a.jpg', size: 100, mimeType: 'image/jpeg' }),
    );
    expect(mockUploadChatAttachment).toHaveBeenCalledWith({
      orgId: 'org-1',
      roomId: 'room-1',
      file: expect.objectContaining({ name: 'a.jpg' }),
    });
    expect(mockSend).toHaveBeenCalledWith(
      'lihat gambar',
      [],
      undefined,
      { attachments: [{ path: 'org-1/room-1/uuid-a.jpg', name: 'a.jpg', mime: 'image/jpeg', size: 100, kind: 'photo' }] },
    );
    expect(msgId).toBe('m-new');
  });

  it('[AF-2] anti-double-tap: second call returns same promise', async () => {
    let resolveUpload: (v: { path: string; mimeType: string }) => void = () => {};
    mockUploadChatAttachment.mockImplementation(
      () => new Promise((res) => { resolveUpload = res; }),
    );
    const { result } = await renderHook(() => useChatAttachmentFlow());
    const { run } = result.current;
    const p1 = run(makeInput());
    const p2 = run(makeInput());
    expect(p2).toBe(p1);
    resolveUpload({ path: 'org-1/room-1/uuid-a.jpg', mimeType: 'image/jpeg' });
    await p1;
  });

  it('[AF-3] upload partial fail → cleanup only uploaded paths', async () => {
    mockUploadChatAttachment
      .mockResolvedValueOnce({ path: 'org-1/room-1/uuid-a.jpg', mimeType: 'image/jpeg' })
      .mockRejectedValueOnce(new Error('upload fail'));
    const input = makeInput({
      files: [
        { uri: 'file:///a.jpg', name: 'a.jpg', size: 100, mimeType: 'image/jpeg' },
        { uri: 'file:///b.jpg', name: 'b.jpg', size: 200, mimeType: 'image/jpeg' },
      ],
    });
    const { result } = await renderHook(() => useChatAttachmentFlow());

    await expect(result.current.run(input)).rejects.toThrow('upload fail');
    expect(mockCleanupOrphanChatUpload).toHaveBeenCalledWith('org-1/room-1/uuid-a.jpg');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('[AF-4] all uploads fail → no cleanup (no paths uploaded)', async () => {
    mockUploadChatAttachment.mockRejectedValue(new Error('all fail'));
    const { result } = await renderHook(() => useChatAttachmentFlow());

    await expect(result.current.run(makeInput())).rejects.toThrow('all fail');
    expect(mockCleanupOrphanChatUpload).not.toHaveBeenCalled();
  });

  it('[AF-5] commit (send) fails → cleanup uploaded paths', async () => {
    mockSend.mockRejectedValueOnce(new Error('commit fail'));
    const { result } = await renderHook(() => useChatAttachmentFlow());

    await expect(result.current.run(makeInput())).rejects.toThrow('commit fail');
    expect(mockCleanupOrphanChatUpload).toHaveBeenCalledWith('org-1/room-1/uuid-a.jpg');
  });

  it('[AF-5b] commit fail AND cleanup fail → error surfaced = commit error (not cleanup)', async () => {
    mockSend.mockRejectedValueOnce(new Error('commit fail'));
    mockCleanupOrphanChatUpload.mockRejectedValueOnce(new Error('cleanup fail'));
    const { result } = await renderHook(() => useChatAttachmentFlow());

    await expect(result.current.run(makeInput())).rejects.toThrow('commit fail');
  });

  it('[AF-6] success → no cleanup called', async () => {
    const { result } = await renderHook(() => useChatAttachmentFlow());
    await result.current.run(makeInput());
    expect(mockCleanupOrphanChatUpload).not.toHaveBeenCalled();
  });

  it('[AF-8] optimistic = undefined (inserted AFTER upload, not before)', async () => {
    const { result } = await renderHook(() => useChatAttachmentFlow());
    await result.current.run(makeInput());
    expect(mockSend).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      expect.any(Object),
    );
  });

  it('validation failure → no upload, no send', async () => {
    mockValidateChatAttachmentCount.mockImplementation(() => {
      throw new Error('Maksimal 3 gambar per pesan.');
    });
    const { result } = await renderHook(() => useChatAttachmentFlow());

    await expect(result.current.run(makeInput())).rejects.toThrow('3 gambar');
    expect(mockUploadChatAttachment).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
