import { describe, expect, it } from 'vitest';
import {
  MAX_COVER_FILE_BYTES,
  MAX_COVER_REQUEST_BYTES,
} from './cover-upload-limits';

describe('cover upload limits', () => {
  it('keeps the file and multipart request below the Vercel payload limit', () => {
    expect(MAX_COVER_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_COVER_REQUEST_BYTES).toBeGreaterThan(MAX_COVER_FILE_BYTES);
    expect(MAX_COVER_REQUEST_BYTES).toBeLessThan(4_500_000);
  });
});
