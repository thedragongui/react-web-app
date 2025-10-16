import { describe, expect, it } from 'vitest';
import { formatBytes, isImage, isPdf, sanitizeFileName } from './files';

describe('files utilities', () => {
  it('sanitizes filenames by replacing invalid characters', () => {
    expect(sanitizeFileName('badge photo(1).png')).toBe('badge_photo_1_.png');
    expect(sanitizeFileName('çrédit.pdf')).toBe('_r_dit.pdf');
  });

  it('detects image content types', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('image/jpeg')).toBe(true);
    expect(isImage('application/pdf')).toBe(false);
    expect(isImage()).toBe(false);
  });

  it('detects pdf content types', () => {
    expect(isPdf('application/pdf')).toBe(true);
    expect(isPdf('image/png')).toBe(false);
    expect(isPdf(null)).toBe(false);
  });

  it('formats file sizes in human readable units', () => {
    expect(formatBytes(999)).toBe('999 o');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 Mo');
    expect(formatBytes()).toBe('');
  });
});
