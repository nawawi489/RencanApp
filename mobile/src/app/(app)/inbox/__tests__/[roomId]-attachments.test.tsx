// Attachment UI tests — split from [roomId].test.tsx per TDD plan §Fase 6 step 38.
// Mock hook boundary: same pattern as [roomId].test.tsx, extended with attachment state.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

let mockRoomParams: { roomId?: string } = { roomId: 'r1' };
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    useLocalSearchParams: () => mockRoomParams,
    useRouter: () => ({ push: mockPush }),
    Stack: {
      Screen: (props: { options?: Record<string, unknown> }) => {
        const opts = props?.options ?? {};
        const bits: React.ReactNode[] = [];
        if (typeof opts.headerTitle === 'function') {
          bits.push(React.createElement(opts.headerTitle as React.FC, { key: 'title' }));
        }
        if (typeof opts.headerRight === 'function') {
          bits.push(React.createElement(opts.headerRight as React.FC, { key: 'right' }));
        }
        return bits.length ? React.createElement(React.Fragment, {}, ...bits) : null;
      },
    },
  };
});

let mockSession: { user: { id: string } } | null = { user: { id: 'me' } };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
let mockIsSending = false;
const mockLoadOlder = jest.fn();
const mockUseChatRoom = jest.fn();
const mockUseChatRoomMembers = jest.fn();
const mockUseChatReads = jest.fn();
const mockRunAttachmentFlow = jest.fn();

jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({ send: mockSend, markRead: mockMarkRead, isSending: mockIsSending }),
  useChatRealtime: () => {},
  useChatRoom: (...a: unknown[]) => mockUseChatRoom(...a),
  useChatRoomMembers: (...a: unknown[]) => mockUseChatRoomMembers(...a),
  useChatReads: (...a: unknown[]) => mockUseChatReads(...a),
  useChatReadsRealtime: () => {},
}));

jest.mock('@/hooks/use-chat-attachment-flow', () => ({
  useChatAttachmentFlow: () => ({ run: mockRunAttachmentFlow, isUploading: false }),
}));

const mockLaunchImageLibraryAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunchImageLibraryAsync(...a),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn(),
}));

jest.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { organization_id: 'org-1' }, isLoading: false, can: () => true }),
}));

// eslint-disable-next-line import/first
import ChatRoomScreen from '../[roomId]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUseChatMessages.mockReset();
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockLoadOlder.mockReset();
  mockSend.mockResolvedValue('m2');
  mockMarkRead.mockResolvedValue(0);
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockIsSending = false;
  mockPush.mockReset();
  mockUseChatRoom.mockReset();
  mockUseChatRoomMembers.mockReset();
  mockUseChatReads.mockReset();
  mockRunAttachmentFlow.mockReset();
  mockLaunchImageLibraryAsync.mockReset();
  mockUseChatRoom.mockReturnValue({ room: null });
  mockUseChatRoomMembers.mockReturnValue({ members: [{ id: 'me', full_name: 'Saya' }] });
  mockUseChatReads.mockReturnValue({ readsByMessage: new Map() });
  mockRunAttachmentFlow.mockResolvedValue('m-att');
  mockUseChatMessages.mockReturnValue({
    messages: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    loadOlder: mockLoadOlder,
    hasMore: false,
  });
});

// =========================================================== Step 38-39: ChatAttachButton ==========================================================
describe('ChatAttachButton', () => {
  it('[ATT-1] renders with accessibilityLabel "Lampirkan gambar" and 44x44 touch target', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const btn = screen.getByLabelText('Lampirkan gambar');
    expect(btn).toBeTruthy();
    expect(btn.props.style).toEqual(expect.objectContaining({ width: 44, height: 44 }));
  });

  it('[ATT-2] disabled when isSending=true', async () => {
    mockIsSending = true;
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const btn = screen.getByLabelText('Lampirkan gambar');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

// =========================================================== Step 42-43: Composer Kirim guard with attachments ==========================================================
describe('Composer — Kirim guard with attachments', () => {
  it('[ATT-3] Kirim disabled when text empty even if attachments selected (caption wajib)', async () => {
    // Picker returns a file
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    // Tap attach → picker opens → file selected
    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    // Preview should appear
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());
    // Send still disabled (no caption)
    const sendBtn = screen.getByLabelText('Kirim pesan');
    expect(sendBtn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('[ATT-4] Kirim enabled when text + attachments both present', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    // Type caption
    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Lihat ini');
    await waitFor(() => {
      const sendBtn = screen.getByLabelText('Kirim pesan');
      expect(sendBtn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    });
  });
});

// =========================================================== Step 44-47: AttachmentPreviewRow ==========================================================
describe('AttachmentPreviewRow', () => {
  it('[ATT-5] selected files appear as previews in composer', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' },
        { uri: 'file:///b.png', fileName: 'b.png', fileSize: 200, type: 'image/png' },
      ],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => {
      expect(screen.getByText('a.jpg')).toBeTruthy();
      expect(screen.getByText('b.png')).toBeTruthy();
    });
  });

  it('[ATT-6] remove button removes file from preview', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Hapus a.jpg'));
    await waitFor(() => expect(screen.queryByText('a.jpg')).toBeNull());
  });
});

// =========================================================== Step 50-59: ChatAttachmentThumbnail in bubble ==========================================================
describe('ChatAttachmentThumbnail', () => {
  const msgWithAttachments = {
    id: 'm1',
    chat_room_id: 'r1',
    author_id: 'u2',
    body: 'Lihat foto',
    created_at: '2026-07-14T01:00:00Z',
    attachments: [
      { path: 'org/room/a.jpg', name: 'a.jpg', mime: 'image/jpeg', size: 500, kind: 'photo' },
    ],
  };

  it('[ATT-8] message with attachments renders thumbnail', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [msgWithAttachments],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      loadOlder: mockLoadOlder,
      hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Lampiran a.jpg')).toBeTruthy();
  });

  it('[ATT-11] text-only message has NO thumbnail', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'u2', body: 'Teks saja', created_at: '2026-07-14T01:00:00Z' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      loadOlder: mockLoadOlder,
      hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Teks saja')).toBeTruthy();
    expect(screen.queryByLabelText(/^Lampiran /)).toBeNull();
  });

  it('[ATT-15] system event has NO thumbnail', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: null, body: 'Status berubah', created_at: '2026-07-14T01:00:00Z', kind: 'system' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      loadOlder: mockLoadOlder,
      hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Status berubah')).toBeTruthy();
    expect(screen.queryByLabelText(/^Lampiran /)).toBeNull();
  });

  it('[ATT-12] 3 attachments = 3 thumbnails', async () => {
    const msg = {
      ...msgWithAttachments,
      attachments: [
        { path: 'o/r/a.jpg', name: 'a.jpg', mime: 'image/jpeg', size: 100, kind: 'photo' },
        { path: 'o/r/b.png', name: 'b.png', mime: 'image/png', size: 200, kind: 'photo' },
        { path: 'o/r/c.webp', name: 'c.webp', mime: 'image/webp', size: 300, kind: 'photo' },
      ],
    };
    mockUseChatMessages.mockReturnValue({
      messages: [msg],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      loadOlder: mockLoadOlder,
      hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await waitFor(() => {
      expect(screen.getByLabelText('Lampiran a.jpg')).toBeTruthy();
      expect(screen.getByLabelText('Lampiran b.png')).toBeTruthy();
      expect(screen.getByLabelText('Lampiran c.webp')).toBeTruthy();
    });
  });
});

// =========================================================== Step 60-63: handleSend with attachments ==========================================================
describe('handleSend — attachments', () => {
  it('[ATT-13] send with attachments calls useChatAttachmentFlow.run', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    // Attach file
    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    // Type caption — wait for re-render before pressing send
    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Lihat');
    await waitFor(() => expect(input.props.value).toBe('Lihat'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() =>
      expect(mockRunAttachmentFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Lihat',
          files: expect.arrayContaining([expect.objectContaining({ name: 'a.jpg' })]),
        }),
      ),
    );
  });

  it('[ATT-14] caption preserved on send failure', async () => {
    mockRunAttachmentFlow.mockRejectedValueOnce(new Error('upload fail'));
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Lihat foto');
    await waitFor(() => expect(input.props.value).toBe('Lihat foto'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    // Caption preserved
    expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('Lihat foto');
  });
});

// =========================================================== Step 64-65: Validation microcopy ==========================================================
describe('Validation microcopy', () => {
  it('[EE-4] "Tambahkan keterangan" hint when attachments present + caption empty', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    expect(screen.getByText('Tambahkan keterangan singkat untuk gambar ini.')).toBeTruthy();
  });

  it('[EE-6] picker cancelled → no error, no file added', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    // Wait a tick — nothing should appear
    await waitFor(() => expect(true).toBe(true));
    expect(screen.queryByLabelText(/^Hapus /)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[EE-11] double-tap send → attachment flow called once', async () => {
    let resolveRun: (v: string) => void = () => {};
    mockRunAttachmentFlow.mockImplementation(
      () => new Promise<string>((res) => { resolveRun = res; }),
    );
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 100, type: 'image/jpeg' }],
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    fireEvent.press(screen.getByLabelText('Lampirkan gambar'));
    await waitFor(() => expect(screen.getByText('a.jpg')).toBeTruthy());

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'foto');
    await waitFor(() => expect(input.props.value).toBe('foto'));
    // Rapid double-tap
    fireEvent.press(screen.getByLabelText('Kirim pesan'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(mockRunAttachmentFlow).toHaveBeenCalledTimes(1));
    resolveRun('m-att');
  });

  it('[EE-14] non-member → composer + attach button NOT rendered', async () => {
    mockUseChatRoomMembers.mockReturnValue({ members: [{ id: 'other-user', full_name: 'Orang Lain' }] });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(true).toBe(true));
    expect(screen.queryByLabelText('Kirim pesan')).toBeNull();
    expect(screen.queryByLabelText('Lampirkan gambar')).toBeNull();
  });
});
