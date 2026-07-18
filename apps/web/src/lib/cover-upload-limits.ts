export const MAX_COVER_FILE_BYTES = 4 * 1024 * 1024;

// Keep the complete multipart request safely below Vercel Functions' 4.5 MB limit.
const MAX_MULTIPART_OVERHEAD_BYTES = 128 * 1024;
export const MAX_COVER_REQUEST_BYTES =
  MAX_COVER_FILE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

export const COVER_FILE_SIZE_LABEL = '4MB';
