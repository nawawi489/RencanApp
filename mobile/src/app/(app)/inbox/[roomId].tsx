// Layar Chat Rencana Aksi — UI-S-IN2/IN3/IN4.
// Tata letak flex chat: header banner governance (tutup) → daftar pesan kronologis-menaik
// (date divider antar-hari) yang mengisi ruang (flex-1) → composer circular yang PINNED di bawah
// + KeyboardAvoidingView agar keyboard tak menutup input. Auto-scroll ke pesan terbaru saat room
// dibuka / ada pesan baru (tapi TIDAK saat memuat pesan lama). Realtime: pesan anggota lain muncul
// live (useChatRealtime) + markRead ulang saat pesan tiba selagi layar terbuka.
// Guard: roomId undefined → ErrorState (markRead TIDAK dipanggil).
// Pola: useAuth().session?.user?.id menentukan me; default 'them' saat session kosong.
// Per Critic §8.4: SendButton pakai inline style {width:44,height:44} (NativeWind class tak selalu flatten di jest)
// dan accessibilityState={{disabled}} eksplisit.
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { Avatar, EmptyState, ErrorState, SkeletonList, usePlaceholderColor } from '@/components/ui';
import {
  useChatActions,
  useChatMessages,
  useChatRealtime,
  useChatReads,
  useChatReadsRealtime,
  useChatRoom,
  useChatRoomMembers,
} from '@/hooks/use-inbox';
import { personLabel } from '@/lib/cards';
import { reportError } from '@/lib/errors';
import type { ChatMember, ChatMessage, ChatReaction, ChatRead } from '@/lib/inbox';
import { createLogger } from '@/lib/logger';
import { parseMentions } from '@/lib/mention-parse';
import { applyMention, collectMentionIds, matchMentionQuery, type MentionPick } from '@/lib/mentions';
import { useAuth } from '@/providers/auth-provider';

const log = createLogger('chat-room');
/** Key AsyncStorage untuk dismiss banner governance (global per-user; sekali tutup = tak muncul lagi). */
const GOVERNANCE_BANNER_KEY = '@rencanapp/chat/governance-banner-dismissed-v1';

const GOVERNANCE_BANNER = 'Chat bukan jalur formal: keputusan & bukti tetap lewat Tugas / Review.';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Label divider per-hari: 'd MMM' id-ID. Mengembalikan null saat invalid (skip render). */
function dayLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short' });
}

function GovernanceBanner({ onClose }: { onClose: () => void }) {
  return (
    <View
      className="mb-2 flex-row items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40"
      accessible
      accessibilityLabel={GOVERNANCE_BANNER}>
      <Text className="text-base">ℹ</Text>
      <Text className="flex-1 text-sm text-blue-800 dark:text-blue-200">{GOVERNANCE_BANNER}</Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Tutup banner"
        hitSlop={8}>
        <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">Tutup</Text>
      </Pressable>
    </View>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <View className="my-3 flex-row items-center gap-2">
      <View className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      <View className="rounded-full bg-neutral-100 px-2.5 py-1 dark:bg-neutral-800">
        <Text className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{label}</Text>
      </View>
      <View className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </View>
  );
}

/** Baris system event (PRD §30 komponen 8) — teks tengah, informational-only. */
function SystemEventRow({ body }: { body: string }) {
  return (
    <View className="items-center py-2">
      <Text className="max-w-[85%] text-center text-xs text-neutral-500 dark:text-neutral-400">
        {body}
      </Text>
    </View>
  );
}

// Reaction pill (PRD §30.6) — urutan ack seed, sisanya by codepoint (D13).
const REACTION_EMOJI_ORDER = ['👍', '✅', '👀', '🙏'];

type AggregatedReaction = { emoji: string; count: number; reactedByMe: boolean };

function aggregateReactions(
  reactions: ChatReaction[] | undefined,
  currentUserId: string | null,
): AggregatedReaction[] {
  if (!reactions || reactions.length === 0) return [];
  const map = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji) ?? { count: 0, reactedByMe: false };
    entry.count++;
    if (currentUserId && r.reactor_id === currentUserId) entry.reactedByMe = true;
    map.set(r.emoji, entry);
  }
  const sorted = Array.from(map.entries()).sort((a, b) => {
    const ia = REACTION_EMOJI_ORDER.indexOf(a[0]);
    const ib = REACTION_EMOJI_ORDER.indexOf(b[0]);
    const oa = ia === -1 ? REACTION_EMOJI_ORDER.length + a[0].codePointAt(0)! : ia;
    const ob = ib === -1 ? REACTION_EMOJI_ORDER.length + b[0].codePointAt(0)! : ib;
    return oa - ob;
  });
  return sorted.map(([emoji, { count, reactedByMe }]) => ({ emoji, count, reactedByMe }));
}

function ReactionPill({
  emoji,
  count,
  reactedByMe,
  onPress,
}: {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  onPress: () => void;
}) {
  const label = `Reaksi ${emoji}, ${count}, ${reactedByMe ? 'saya sudah bereaksi' : 'belum bereaksi'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: reactedByMe }}
      style={{ minWidth: 44, minHeight: 44 }}
      className={`flex-row items-center justify-center rounded-full px-3 ${
        reactedByMe
          ? 'border-2 border-brand-dark bg-blue-50 dark:bg-blue-950/40'
          : 'border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
      }`}>
      <Text className="text-base">{emoji}</Text>
      <Text
        className={`ml-1 text-sm font-semibold ${reactedByMe ? 'text-brand-dark' : 'text-neutral-600 dark:text-neutral-300'}`}>
        {count}
      </Text>
      {reactedByMe ? <Text className="ml-0.5 text-xs font-bold text-brand-dark">✓</Text> : null}
    </Pressable>
  );
}

function ReactionPillRow({
  reactions,
  currentUserId,
  messageId,
  onToggle,
  disabled,
}: {
  reactions: ChatReaction[] | undefined;
  currentUserId: string | null;
  messageId: string;
  onToggle: (messageId: string, emoji: string) => void;
  disabled: boolean;
}) {
  const aggregated = useMemo(
    () => aggregateReactions(reactions, currentUserId),
    [reactions, currentUserId],
  );
  if (aggregated.length === 0) return null;
  return (
    <View className="mt-1 flex-row flex-wrap gap-1">
      {aggregated.map((r) => (
        <ReactionPill
          key={r.emoji}
          emoji={r.emoji}
          count={r.count}
          reactedByMe={r.reactedByMe}
          onPress={() => {
            if (!disabled) onToggle(messageId, r.emoji);
          }}
        />
      ))}
    </View>
  );
}

/** Banner konteks Tugas (PRD §30 rule 2 + komponen 10) — tap → buka Tugas. */
function ContextBanner({
  label,
  entityId,
  onNavigate,
}: {
  label: string;
  entityId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onNavigate(entityId)}
      accessibilityRole="link"
      accessibilityLabel={`Buka Tugas ${label}`}
      style={{ minHeight: 44 }}
      className="mb-1 flex-row items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-950/40">
      <Text className="text-sm text-blue-700 dark:text-blue-300">🔗</Text>
      <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">Konteks Tugas</Text>
      <Text className="flex-1 text-xs text-blue-800 dark:text-blue-200" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-sm text-blue-700 dark:text-blue-300">›</Text>
    </Pressable>
  );
}

function MessageBubble({
  m,
  isMe,
  memberNames,
  currentUserId,
  onToggleReaction,
  reactionDisabled,
  onNavigateContext,
}: {
  m: ChatMessage;
  isMe: boolean;
  memberNames: string[];
  currentUserId: string | null;
  onToggleReaction: (messageId: string, emoji: string) => void;
  reactionDisabled: boolean;
  onNavigateContext: (id: string) => void;
}) {
  const hasContext =
    m.context_entity_type === 'task' && !!m.context_label && !!m.context_entity_id;
  const authorName = m.author?.full_name ?? null;
  // Guard: them tanpa nama → '?' (audit-friendly placeholder).
  const displayName = authorName ?? '?';
  const segments = useMemo(() => parseMentions(m.body, memberNames), [m.body, memberNames]);
  const baseCls = `text-base ${isMe ? 'text-white' : 'text-black dark:text-white'}`;
  const mentionCls = isMe
    ? 'font-semibold text-white underline'
    : 'font-semibold text-brand-dark dark:text-blue-300';
  return (
    <View className={`mb-2 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}>
      {!isMe ? (
        <View className="mb-1 flex-row items-center gap-2">
          <Avatar name={displayName} seed={m.author_id ?? displayName} size={24} />
          <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {displayName}
          </Text>
        </View>
      ) : null}
      {hasContext ? (
        <ContextBanner
          label={m.context_label!}
          entityId={m.context_entity_id!}
          onNavigate={onNavigateContext}
        />
      ) : null}
      <View
        className={`rounded-2xl px-3 py-2 ${
          isMe
            ? 'rounded-br-md bg-brand-dark'
            : 'rounded-bl-md bg-neutral-100 dark:bg-neutral-800'
        }`}>
        <Text className={baseCls}>
          {segments.length === 0
            ? m.body
            : segments.map((seg, i) =>
                seg.kind === 'mention' ? (
                  <Text key={i} className={mentionCls}>
                    {seg.text}
                  </Text>
                ) : (
                  seg.text
                ),
              )}
        </Text>
        <Text className={`mt-1 text-[10px] ${isMe ? 'text-white/80' : 'text-neutral-400'}`}>
          {formatTime(m.created_at)}
        </Text>
      </View>
      <ReactionPillRow
        reactions={m.reactions}
        currentUserId={currentUserId}
        messageId={m.id}
        onToggle={onToggleReaction}
        disabled={reactionDisabled}
      />
    </View>
  );
}

/** Topbar konteks (PRD §30): avatar group + jumlah anggota (buka daftar) + buka Rencana Aksi. */
function RoomContextBar({
  members,
  onOpenMembers,
  onOpenActionPlan,
}: {
  members: ChatMember[];
  onOpenMembers: () => void;
  onOpenActionPlan?: () => void;
}) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  return (
    <View className="mb-2 flex-row items-center justify-between gap-2">
      <Pressable
        onPress={onOpenMembers}
        accessibilityRole="button"
        accessibilityLabel={`${members.length} anggota`}
        className="flex-1 flex-row items-center gap-2 active:opacity-70">
        <View className="flex-row">
          {shown.map((m, i) => (
            <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar name={personLabel(m, '?')} seed={m.id} size={24} />
            </View>
          ))}
          {extra > 0 ? (
            <View
              style={{ marginLeft: -8 }}
              className="h-6 w-6 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
              <Text className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
                +{extra}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          {members.length} anggota
        </Text>
      </Pressable>
      {onOpenActionPlan ? (
        <Pressable
          onPress={onOpenActionPlan}
          accessibilityRole="button"
          accessibilityLabel="Buka Rencana Aksi"
          className="flex-row items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 active:opacity-70 dark:border-neutral-700">
          <Ionicons name="open-outline" size={14} color="#1564b3" />
          <Text className="text-xs font-semibold text-brand-dark dark:text-blue-300">Rencana Aksi</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Format tanggal + jam untuk read_at ('d MMM HH:mm' id-ID). */
function formatReadAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Dilihat oleh N" di bawah bubble me terakhir yang punya pembaca lain. Tap → ReadsModal. */
function SeenByPill({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Dilihat oleh ${count} orang`}
      hitSlop={6}
      className="mt-0.5 self-end active:opacity-70">
      <View className="flex-row items-center gap-1">
        <Ionicons name="checkmark-done" size={12} color="#6b7280" />
        <Text className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Dilihat oleh {count}
        </Text>
      </View>
    </Pressable>
  );
}

/** Modal daftar pembaca sebuah pesan (nama + waktu baca). */
function ReadsModal({
  visible,
  reads,
  onClose,
}: {
  visible: boolean;
  reads: ChatRead[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessibilityLabel="Tutup daftar pembaca"
        onPress={onClose}>
        <Pressable className="max-h-[70%] rounded-t-3xl bg-white p-5 dark:bg-neutral-900" onPress={() => {}}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-black dark:text-white">
              Dilihat oleh ({reads.length})
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Tutup" hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView>
            {reads.map((r) => (
              <View key={r.reader_id} className="flex-row items-center gap-3 py-2">
                <Avatar name={personLabel(r.reader, '?')} seed={r.reader_id} size={36} />
                <View className="flex-1">
                  <Text className="text-base text-black dark:text-white">
                    {personLabel(r.reader, '?')}
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatReadAt(r.read_at)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Modal daftar anggota room. */
function MembersModal({
  visible,
  members,
  onClose,
}: {
  visible: boolean;
  members: ChatMember[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessibilityLabel="Tutup daftar anggota"
        onPress={onClose}>
        <Pressable className="max-h-[70%] rounded-t-3xl bg-white p-5 dark:bg-neutral-900" onPress={() => {}}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-black dark:text-white">
              Anggota ({members.length})
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Tutup" hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView>
            {members.map((m) => (
              <View key={m.id} className="flex-row items-center gap-3 py-2">
                <Avatar name={personLabel(m, '?')} seed={m.id} size={36} />
                <Text className="flex-1 text-base text-black dark:text-white">{personLabel(m, '?')}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Overlay saran @mention di atas composer. */
function MentionSuggestions({
  members,
  onPick,
}: {
  members: ChatMember[];
  onPick: (m: ChatMember) => void;
}) {
  if (members.length === 0) return null;
  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
      {members.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => onPick(m)}
          accessibilityRole="button"
          accessibilityLabel={`Sebut ${personLabel(m, '?')}`}
          className="flex-row items-center gap-2 border-b border-neutral-100 bg-white px-3 py-2 last:border-b-0 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900">
          <Avatar name={personLabel(m, '?')} seed={m.id} size={24} />
          <Text className="flex-1 text-sm text-black dark:text-white">{personLabel(m, '?')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SendButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  // Critic §8.4: inline 44×44 + accessibilityState eksplisit.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Kirim pesan"
      accessibilityState={{ disabled }}
      style={{ width: 44, height: 44 }}
      className={`items-center justify-center rounded-full bg-brand-dark ${disabled ? 'opacity-40' : 'active:opacity-80'}`}>
      <Ionicons name="send" size={18} color="#ffffff" />
    </Pressable>
  );
}

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const safeRoomId = roomId ?? '';
  const { messages, isLoading, isError, refetch, loadOlder, hasMore } = useChatMessages(safeRoomId);
  const { send, markRead, isSending, toggleReaction, isTogglingReaction } =
    useChatActions(safeRoomId);
  const { room } = useChatRoom(safeRoomId);
  const { members } = useChatRoomMembers(safeRoomId);
  const { readsByMessage } = useChatReads(safeRoomId);
  useChatReadsRealtime(safeRoomId);
  const [text, setText] = useState('');
  // Selection dikontrol HANYA sesaat setelah sisip mention (pindah kursor ke akhir teks tersisip);
  // di luar itu `undefined` agar TextInput bebas mengelola kursor sendiri saat user mengetik biasa.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [mentions, setMentions] = useState<MentionPick[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [readsOpenFor, setReadsOpenFor] = useState<string | null>(null);
  const placeholderColor = usePlaceholderColor();
  const [sendError, setSendError] = useState<string | null>(null);
  // Banner governance: mulai `null` = "belum tahu". Setelah AsyncStorage terbaca, jadi bool.
  // Render banner HANYA saat sudah tahu belum di-dismiss → tak flicker saat kembali ke room.
  const [bannerDismissed, setBannerDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(GOVERNANCE_BANNER_KEY)
      .then((raw) => {
        if (!cancelled) setBannerDismissed(raw === '1');
      })
      .catch((err) => {
        log.warn('gagal baca dismiss banner', err);
        if (!cancelled) setBannerDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function dismissBanner() {
    setBannerDismissed(true);
    AsyncStorage.setItem(GOVERNANCE_BANNER_KEY, '1').catch((err) =>
      log.warn('gagal simpan dismiss banner', err),
    );
  }

  const memberNames = useMemo(
    () => members.map((m) => personLabel(m, '')).filter((n) => n.length > 0),
    [members],
  );

  // Saran @mention: token '@…' di ujung teks → anggota room (kecuali diri) yang cocok.
  const mentionQuery = useMemo(() => matchMentionQuery(text), [text]);
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.id !== currentUserId && personLabel(m, '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members, currentUserId]);

  function handlePickMention(m: ChatMember) {
    const name = personLabel(m, '?');
    const next = applyMention(text, name);
    setText(next);
    // applyMention selalu menyisip di UJUNG teks (lihat matchMentionQuery) → kursor ke next.length.
    setSelection({ start: next.length, end: next.length });
    setMentions((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, { id: m.id, name }]));
  }

  useEffect(() => {
    // Guard: roomId undefined / kosong → JANGAN panggil markRead.
    if (roomId) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jalankan sekali saat room dibuka
  }, [roomId]);

  // Realtime: pesan anggota lain muncul live; tandai terbaca ulang saat pesan tiba (layar terbuka).
  useChatRealtime(safeRoomId, () => {
    if (roomId) markRead();
  });

  // Kronologis-menaik: hook desc (terbaru→lama) → balik agar oldest di atas, newest di bawah.
  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  // Seen-by: id pesan 'me' TERAKHIR yang punya minimal satu pembaca ≠ diri. Pola WhatsApp:
  // satu indikator per timeline; pesan me lain di atasnya implisit sudah dilihat lebih dulu.
  const lastSeenMeId = useMemo(() => {
    if (!currentUserId) return null;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const m = ordered[i];
      if (m.author_id !== currentUserId) continue;
      const reads = readsByMessage.get(m.id);
      if (reads?.some((r) => r.reader_id !== currentUserId)) return m.id;
    }
    return null;
  }, [ordered, readsByMessage, currentUserId]);

  // Auto-scroll ke bawah: hanya saat pesan TERBARU berubah (kirim / realtime / initial), bukan saat
  // memuat pesan lama (prepend di atas). Gate lewat ref newest-id + flag yang dibaca onContentSizeChange.
  const scrollRef = useRef<ScrollView>(null);
  const lastNewestId = useRef<string | null>(null);
  const stickToEnd = useRef(false);
  const newestId = ordered.length ? ordered[ordered.length - 1].id : null;
  useEffect(() => {
    if (newestId && newestId !== lastNewestId.current) {
      lastNewestId.current = newestId;
      stickToEnd.current = true;
    }
  }, [newestId]);

  // Per Critic §8.5: bangun divider sekali per "blok hari" pada array yang sudah merged+ordered.
  type Row = { kind: 'divider'; key: string; label: string } | { kind: 'msg'; key: string; m: ChatMessage };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prevDay: string | null = null;
    for (const m of ordered) {
      const label = dayLabel(m.created_at);
      if (label && label !== prevDay) {
        out.push({ kind: 'divider', key: `d-${label}-${m.id}`, label });
        prevDay = label;
      }
      out.push({ kind: 'msg', key: m.id, m });
    }
    return out;
  }, [ordered]);

  async function handleSend() {
    if (isSending) return; // anti double-submit (Critic §8.5)
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    // Optimistic: bubble 'me' tampil instan; hook rollback bila server menolak.
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      chat_room_id: safeRoomId,
      author_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
    };
    const mentionIds = collectMentionIds(body, mentions);
    try {
      await send(body, mentionIds, optimistic);
      setText('');
      setSelection(undefined);
      setMentions([]);
    } catch (e) {
      setSendError(reportError('Kirim pesan', e, 'Gagal mengirim pesan.'));
    }
  }

  // Guard: roomId undefined → ErrorState (Critic §8.5).
  if (!roomId) {
    return (
      <View className="flex-1 bg-white dark:bg-black px-5 pt-3">
        <ErrorState
          title="Room tidak ditemukan"
          description="Buka room dari Inbox untuk memulai diskusi."
        />
      </View>
    );
  }

  const isInputBlank = text.trim().length === 0;
  const composerDisabled = isInputBlank || isSending;

  return (
    <View className="flex-1 bg-white dark:bg-black">
      {/* Native header title = nama room (PRD §30). Fallback statis saat detail belum termuat. */}
      <Stack.Screen options={{ title: room?.name ?? 'Diskusi Rencana Aksi' }} />
      <MembersModal visible={membersOpen} members={members} onClose={() => setMembersOpen(false)} />
      <ReadsModal
        visible={readsOpenFor != null}
        reads={
          readsOpenFor
            ? (readsByMessage.get(readsOpenFor) ?? []).filter((r) => r.reader_id !== currentUserId)
            : []
        }
        onClose={() => setReadsOpenFor(null)}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // Offset ≈ tinggi native header iOS (44 + safe-area). Aproksimasi; Android pakai adjustResize.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        {members.length > 0 || room ? (
          <View className="px-5 pt-3">
            <RoomContextBar
              members={members}
              onOpenMembers={() => setMembersOpen(true)}
              onOpenActionPlan={
                room?.action_plan_id
                  ? () => router.push(`/action-plan/${room.action_plan_id}` as Href)
                  : undefined
              }
            />
          </View>
        ) : null}

        {bannerDismissed === false ? (
          <View className="px-5 pt-3">
            <GovernanceBanner onClose={dismissBanner} />
          </View>
        ) : null}

        {isLoading ? (
          <View className="flex-1 px-5 pt-3">
            <SkeletonList count={4} />
          </View>
        ) : isError ? (
          <View className="flex-1 px-5 pt-3">
            <ErrorState
              title="Gagal memuat pesan"
              description="Tidak bisa mengambil percakapan."
              onRetry={() => refetch()}
            />
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 px-5 pt-3">
            <EmptyState
              icon={<Text className="text-2xl">💬</Text>}
              title="Belum ada pesan"
              description="Mulai percakapan dengan mengirim pesan pertama."
            />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 0 }}
            onContentSizeChange={() => {
              if (stickToEnd.current) {
                stickToEnd.current = false;
                scrollRef.current?.scrollToEnd?.({ animated: false });
              }
            }}>
            {hasMore ? (
              <Pressable
                onPress={() => loadOlder()}
                className="mb-2 self-center rounded-full border border-neutral-300 px-4 py-2 active:opacity-70 dark:border-neutral-700"
                accessibilityRole="button"
                accessibilityLabel="Muat pesan lama">
                <Text className="text-sm font-semibold text-black dark:text-white">Muat pesan lama</Text>
              </Pressable>
            ) : null}
            {rows.map((r) => {
              if (r.kind === 'divider') return <DateDivider key={r.key} label={r.label} />;
              // System event (PRD §30 komponen 8) — baris tengah informational-only.
              if (r.m.kind === 'system') return <SystemEventRow key={r.key} body={r.m.body} />;
              const isMe = currentUserId != null && r.m.author_id === currentUserId;
              const showSeen = isMe && r.m.id === lastSeenMeId;
              const foreignReads = showSeen
                ? (readsByMessage.get(r.m.id) ?? []).filter((x) => x.reader_id !== currentUserId)
                : [];
              return (
                <View key={r.key}>
                  <MessageBubble
                    m={r.m}
                    isMe={isMe}
                    memberNames={memberNames}
                    currentUserId={currentUserId}
                    onToggleReaction={toggleReaction}
                    reactionDisabled={isTogglingReaction}
                    onNavigateContext={(id) => router.push(`/task/${id}` as Href)}
                  />
                  {showSeen ? (
                    <SeenByPill
                      count={foreignReads.length}
                      onOpen={() => setReadsOpenFor(r.m.id)}
                    />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}

        <View className="gap-2 border-t border-neutral-200 px-5 pb-3 pt-2 dark:border-neutral-800">
          <MentionSuggestions members={mentionSuggestions} onPick={handlePickMention} />
          <View className="flex-row items-end gap-2">
            <TextInput
              className="max-h-32 flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
              placeholder="Tulis pesan…"
              placeholderTextColor={placeholderColor}
              value={text}
              onChangeText={(t) => {
                setText(t);
                setSelection(undefined);
              }}
              selection={selection}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              multiline
            />
            <SendButton disabled={composerDisabled} onPress={handleSend} />
          </View>
          {sendError ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
              {sendError}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
