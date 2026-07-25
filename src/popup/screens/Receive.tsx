/**
 * Receive screen (BUS-21): the account's full address plus a scannable QR code
 * that encodes exactly that address, with a copy button.
 *
 * The QR encodes the raw bech32 address (no `?amount=` URI): v1 receive is
 * "here is my address", and a bare address scans in every Cosmos wallet. The
 * code renders as inline SVG — black modules on a white card regardless of the
 * popup theme, because a QR must stay high-contrast dark-on-light to scan.
 *
 * All QR logic lives in the pure {@link ../qr} module; this screen only wraps
 * its matrix/path in an `<svg>`.
 */

import { useMemo } from 'react';
import { BZE_DISPLAY_DENOM } from '../../chain/constants';
import type { VaultAccount } from '../../keyring/vault';
import { qrMatrix, qrSize, qrSvgPath } from '../qr';
import { useClipboardCopy } from '../useCopy';

interface ReceiveProps {
  readonly account: VaultAccount;
  readonly onClose: () => void;
}

export function Receive({ account, onClose }: ReceiveProps) {
  const { copied, error, copy } = useClipboardCopy();

  // Encoding is pure and depends only on the address, so memoise it rather than
  // rebuild the matrix on every render (e.g. each "Copied" toggle).
  const matrix = useMemo(() => qrMatrix(account.address), [account.address]);
  const path = useMemo(() => qrSvgPath(matrix), [matrix]);
  const size = qrSize(matrix);

  return (
    <section className="screen">
      <h1 className="screen__title">Receive {BZE_DISPLAY_DENOM}</h1>
      <p className="screen__body">
        Scan this code or copy the address below to receive {BZE_DISPLAY_DENOM}.
      </p>

      <div className="qr">
        <svg
          className="qr__code"
          viewBox={`0 0 ${size} ${size}`}
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="crispEdges"
          role="img"
          aria-label="QR code of your wallet address"
        >
          <rect width={size} height={size} fill="#ffffff" />
          <path d={path} fill="#000000" />
        </svg>
      </div>

      <button
        type="button"
        className="address"
        onClick={() => void copy(account.address)}
        title={`${account.address}\nClick to copy`}
        aria-label={copied ? 'Address copied' : 'Copy address'}
      >
        <span className="address__value">{account.address}</span>
        <span className="address__action" aria-hidden="true">
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      {error && <p className="form__error">{error}</p>}

      <button className="button button--link" type="button" onClick={onClose}>
        Back
      </button>
    </section>
  );
}
