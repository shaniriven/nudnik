import type { gmail_v1 } from 'googleapis';
import { vi } from 'vitest';

export function createFakeGmailClient(
  overrides: {
    listPages?: { messages?: { id: string; threadId?: string }[]; nextPageToken?: string }[];
    messages?: Record<string, unknown>;
  } = {},
): gmail_v1.Gmail {
  const pages = overrides.listPages ?? [{ messages: [] }];
  let callIndex = 0;
  const list = vi.fn().mockImplementation(() => {
    const page = pages[Math.min(callIndex, pages.length - 1)];
    callIndex += 1;
    return Promise.resolve({ data: page });
  });

  const get = vi
    .fn()
    .mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({ data: overrides.messages?.[id] ?? { id } }),
    );

  return {
    users: {
      messages: { list, get },
    },
  } as unknown as gmail_v1.Gmail;
}
