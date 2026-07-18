// Cloudflare Workers uses the IMAGES binding in remote-image.ts. This module is
// only selected by the Workers build so Turbopack does not trace sharp's native
// libvips binary into the workerd bundle.
export default function sharpUnavailable(): never {
  throw new Error('sharp is unavailable in the Cloudflare Workers runtime.');
}
