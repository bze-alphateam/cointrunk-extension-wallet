/**
 * Turn text into a QR code, for the Receive screen (BUS-21).
 *
 * QR generation is delegated to `qr` (paulmillr) — a zero-dependency, pure-JS
 * encoder from the same author as the `@noble` libraries CosmJS already bundles.
 * This keeps the Security Model's "don't hand-roll spec-heavy primitives"
 * posture (BIP39 / secp256k1 come from a library, not us): Reed–Solomon error
 * correction and the QR bit layout are exactly that kind of code.
 *
 * The module is deliberately DOM-free and pure, so it is unit-testable in Node
 * like the chain/keyring modules: it yields a boolean matrix and an SVG `path`
 * string, and the React screen only wraps them in an `<svg>`.
 */

import encodeQR from 'qr';

/**
 * QR quiet zone in modules. ISO/IEC 18004 §9.1 requires a 4-module light margin
 * on all four sides for reliable scanning; the library defaults to a compact 2,
 * so we ask for the standards-conformant 4 (BUS-21 AC: "QR scans correctly").
 */
export const QR_QUIET_ZONE = 4;

/**
 * Encode `text` into a square QR matrix where `matrix[y][x] === true` is a dark
 * module. Medium error correction (the library default) balances density
 * against damage tolerance — ample for an address in a 320px popup — and the
 * returned matrix already includes the {@link QR_QUIET_ZONE} light border.
 *
 * Throws on empty input rather than emit a symbol that encodes nothing.
 */
export function qrMatrix(text: string): boolean[][] {
  if (text.length === 0) {
    throw new Error('cannot encode an empty QR payload');
  }
  return encodeQR(text, 'raw', { ecc: 'medium', border: QR_QUIET_ZONE });
}

/**
 * Build the SVG `path` `d` that covers every dark module as a 1×1 square, in a
 * coordinate space of {@link qrSize} units per side. One path for the whole
 * symbol keeps the DOM tiny — hundreds of modules collapse into a single
 * element instead of hundreds of `<rect>`s.
 */
export function qrSvgPath(matrix: readonly (readonly boolean[])[]): string {
  let d = '';
  for (let y = 0; y < matrix.length; y += 1) {
    const row = matrix[y]!;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x]) {
        d += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  return d;
}

/** Side length of the matrix in modules — the SVG viewBox is `0 0 size size`. */
export function qrSize(matrix: readonly (readonly boolean[])[]): number {
  return matrix.length;
}
