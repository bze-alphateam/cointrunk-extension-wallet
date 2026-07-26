/**
 * Block-explorer links for the send success state (BUS-23).
 *
 * Pure and DOM-free so it is unit-testable like the other chain helpers. It
 * mirrors how the public BZE web apps build `<explorer>/tx/<hash>` links
 * (`bze-frontend-apps` `ui-kit`), pointing at the single documented
 * {@link ../chain/constants.BZE_EXPLORER_BASE_URL}.
 */

import { BZE_EXPLORER_BASE_URL } from './constants';

/**
 * Public explorer URL for a transaction hash. The hash is URL-encoded into the
 * path, and an empty/whitespace hash throws rather than produce a link to the
 * explorer's `…/tx/` index — a success state should never render a broken link.
 */
export function txExplorerUrl(hash: string): string {
  const trimmed = hash.trim();
  if (trimmed.length === 0) {
    throw new Error('cannot build an explorer link for an empty tx hash');
  }
  return `${BZE_EXPLORER_BASE_URL}/tx/${encodeURIComponent(trimmed)}`;
}
