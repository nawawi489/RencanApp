import { useRef, useState } from 'react';

import type { ChatAttachment, ChatMessage } from '@/lib/inbox';
import {
  cleanupOrphanChatUpload,
  uploadChatAttachment,
  validateChatAttachmentCount,
  validateChatFile,
  type LocalFile,
} from '@/lib/storage';

export type ChatAttachmentFlowInput = {
  orgId: string;
  roomId: string;
  body: string;
  mentions?: string[];
  files: LocalFile[];
  send: (body: string, mentions: string[], optimistic?: ChatMessage, opts?: { attachments?: ChatAttachment[] }) => Promise<string>;
};

export function useChatAttachmentFlow() {
  const inFlight = useRef<Promise<string> | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const run = (input: ChatAttachmentFlowInput): Promise<string> => {
    if (inFlight.current) return inFlight.current;
    setIsUploading(true);
    const p = execute(input).finally(() => {
      inFlight.current = null;
      setIsUploading(false);
    });
    inFlight.current = p;
    return p;
  };

  return { run, isUploading };
}

async function execute(input: ChatAttachmentFlowInput): Promise<string> {
  validateChatAttachmentCount(input.files.length);
  for (const f of input.files) {
    validateChatFile(f);
  }

  const uploadedPaths: string[] = [];
  try {
    const uploaded = await Promise.all(
      input.files.map((file) =>
        uploadChatAttachment({
          orgId: input.orgId,
          roomId: input.roomId,
          file,
        }).then(({ path, mimeType }) => {
          uploadedPaths.push(path);
          return {
            path,
            name: file.name,
            mime: mimeType,
            size: file.size,
            kind: 'photo' as const,
          } satisfies ChatAttachment;
        }),
      ),
    );

    const msgId = await input.send(
      input.body,
      input.mentions ?? [],
      undefined,
      { attachments: uploaded },
    );
    return msgId;
  } catch (err) {
    if (uploadedPaths.length > 0) {
      await Promise.allSettled(uploadedPaths.map((p) => cleanupOrphanChatUpload(p)));
    }
    throw err;
  }
}
