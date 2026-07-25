/**
 * `copyText` (BUS-20): the address copy helper. Tests exercise the primary
 * Clipboard API path, the fall-through to `execCommand` when the API is missing
 * or rejects, and the "nothing worked" error — the popup relies on that error to
 * decide whether to show the "Copied" confirmation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/popup/clipboard';

const ADDRESS = 'bze1qy352eufqy352eufqy352eufqy352eufqy35abc';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A `document` stub whose `execCommand('copy')` result is configurable. */
function stubDocument(execResult: boolean) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const execCommand = vi.fn(() => execResult);
  vi.stubGlobal('document', {
    createElement: vi.fn(() => textarea),
    execCommand,
    body: { appendChild: vi.fn() },
  });
  return { textarea, execCommand };
}

describe('copyText (BUS-20)', () => {
  it('writes through the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await copyText(ADDRESS);

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });

  it('falls back to execCommand when the Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {});
    const { textarea, execCommand } = stubDocument(true);

    await copyText(ADDRESS);

    expect(textarea.value).toBe(ADDRESS);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('not focused'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { execCommand } = stubDocument(true);

    await copyText(ADDRESS);

    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('throws when neither path can copy', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    stubDocument(false); // execCommand reports failure

    await expect(copyText(ADDRESS)).rejects.toThrow('Clipboard is unavailable.');
  });
});
