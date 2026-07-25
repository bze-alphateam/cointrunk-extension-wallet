/**
 * Copy plain text to the system clipboard from the popup.
 *
 * The async Clipboard API is available in the MV3 popup (a secure extension
 * context), so it is the primary path. A hidden-textarea `execCommand('copy')`
 * fallback keeps the button working if the API is missing or rejects (e.g. the
 * document momentarily lacks focus), rather than leaving the user with a copy
 * button that silently does nothing.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the execCommand path below.
    }
  }
  if (!copyViaExecCommand(text)) {
    throw new Error('Clipboard is unavailable.');
  }
}

/** Legacy copy path: select a detached textarea and run `execCommand('copy')`. */
function copyViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Keep it out of the layout and away from the viewport so it never flashes.
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
