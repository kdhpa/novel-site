import sanitizeHtml from 'sanitize-html';
import { isAllowedStoredImageSource } from '@/lib/image-hosts';

const allowedTags = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'hr',
  'a',
  'img',
  'figure',
  'figcaption',
  'span',
] as const;

/**
 * Sanitize author-controlled chapter HTML with an explicit allowlist.
 *
 * SVG/MathML, inline styles, event handlers and arbitrary data attributes are
 * deliberately excluded. The same function is used on write and on read so
 * legacy content receives the stricter policy as well.
 */
export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...allowedTags],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class'],
      figure: ['class', 'data-ai-generated'],
      span: ['class'],
      code: ['class'],
    },
    allowedClasses: {
      figure: ['ai-illustration'],
      img: ['ai-illustration-img'],
      span: ['illustration-marker'],
      code: [/^language-[a-z0-9_-]+$/i],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['https'],
    },
    nonTextTags: ['script', 'style', 'textarea', 'option', 'svg', 'math'],
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !isAllowedStoredImageSource(frame.attribs.src),
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          ...(attributes.target === '_blank'
            ? { rel: 'noopener noreferrer nofollow' }
            : { rel: 'nofollow' }),
        },
      }),
      img: (_tagName, attributes) => ({
        tagName: 'img',
        attribs: {
          ...attributes,
          alt: attributes.alt || '',
          loading: 'lazy',
        },
      }),
    },
  });
}

export function stripHtmlToText(html: string): string {
  const contentWithBlockSpacing = sanitizeHtmlContent(html).replace(
    /<\/(?:p|h[1-4]|blockquote|li|pre|figure|figcaption)>/gi,
    ' '
  );

  return sanitizeHtml(contentWithBlockSpacing, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
