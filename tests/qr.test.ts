/**
 * QR encoding for the Receive screen (BUS-21). Covers the pure matrix/path
 * helpers; the React screen that wraps them in an `<svg>` is not unit-tested,
 * matching the repo's "test the logic, not the JSX" posture.
 */

import { describe, expect, it } from 'vitest';
import { QR_QUIET_ZONE, qrMatrix, qrSize, qrSvgPath } from '../src/popup/qr';

// A representative BeeZee address is what the screen actually encodes.
const ADDRESS = 'bze1qy352eufqy352eufqy352eufqy352eufktz2x3';

describe('qrMatrix (BUS-21)', () => {
  it('produces a non-empty square matrix', () => {
    const matrix = qrMatrix(ADDRESS);

    expect(matrix.length).toBeGreaterThan(0);
    for (const row of matrix) {
      expect(row.length).toBe(matrix.length);
    }
  });

  it('is deterministic for the same input', () => {
    expect(qrMatrix(ADDRESS)).toEqual(qrMatrix(ADDRESS));
  });

  it('encodes a real symbol — some modules are dark', () => {
    const matrix = qrMatrix(ADDRESS);
    expect(matrix.some((row) => row.some((cell) => cell))).toBe(true);
  });

  it('surrounds the symbol with a standards-conformant light quiet zone', () => {
    const matrix = qrMatrix(ADDRESS);
    const last = matrix.length - 1;

    for (let i = 0; i < QR_QUIET_ZONE; i += 1) {
      // Top and bottom border rows are entirely light...
      expect(matrix[i]!.every((cell) => !cell)).toBe(true);
      expect(matrix[last - i]!.every((cell) => !cell)).toBe(true);
      // ...as are the left and right border columns.
      expect(matrix.every((row) => !row[i])).toBe(true);
      expect(matrix.every((row) => !row[last - i])).toBe(true);
    }
  });

  it('rejects an empty payload rather than encode nothing', () => {
    expect(() => qrMatrix('')).toThrow(/empty/i);
  });
});

describe('qrSvgPath (BUS-21)', () => {
  it('emits one 1×1 square subpath per dark module, row-major', () => {
    const matrix = [
      [true, false],
      [false, true],
    ];
    expect(qrSvgPath(matrix)).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('is empty when no module is dark', () => {
    expect(
      qrSvgPath([
        [false, false],
        [false, false],
      ]),
    ).toBe('');
    expect(qrSvgPath([])).toBe('');
  });

  it('covers exactly the dark modules of a real symbol', () => {
    const matrix = qrMatrix(ADDRESS);
    const darkCount = matrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    const subpaths = qrSvgPath(matrix).match(/M/g)?.length ?? 0;
    expect(subpaths).toBe(darkCount);
  });
});

describe('qrSize (BUS-21)', () => {
  it('is the module count per side', () => {
    const matrix = qrMatrix(ADDRESS);
    expect(qrSize(matrix)).toBe(matrix.length);
  });
});
