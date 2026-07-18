import { describe, expect, it } from 'vitest';
import { sanitizeHtmlContent, stripHtmlToText } from './sanitize';

describe('sanitizeHtmlContent', () => {
  it('keeps the supported chapter markup and hardens links', () => {
    const result = sanitizeHtmlContent(
      '<p><strong>본문</strong> <a href="https://example.com" target="_blank">링크</a></p>'
    );

    expect(result).toContain('<p><strong>본문</strong>');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
  });

  it('removes scripts, SVG, event handlers and encoded javascript URLs', () => {
    const result = sanitizeHtmlContent(
      '<script>alert(1)</script><svg><a xlink:href="javascript:alert(1)">x</a></svg>' +
      '<img src="javascript&#58;alert(1)" onerror="alert(1)"><p onclick="alert(1)">safe</p>'
    );

    expect(result).toBe('<p>safe</p>');
  });

  it('allows only known illustration classes and attributes', () => {
    const result = sanitizeHtmlContent(
      '<figure class="ai-illustration evil" data-ai-generated="true" style="position:fixed">' +
      '<img class="ai-illustration-img evil" src="/uploads/chapter-illustrations/a.png"></figure>'
    );

    expect(result).toContain('class="ai-illustration"');
    expect(result).toContain('class="ai-illustration-img"');
    expect(result).not.toContain('evil');
    expect(result).not.toContain('style=');
  });
});

describe('stripHtmlToText', () => {
  it('returns compact plain text', () => {
    expect(stripHtmlToText('<p>첫 문장</p><p>둘째&nbsp;문장</p>')).toBe('첫 문장 둘째 문장');
  });
});
