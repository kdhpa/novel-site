// Text auto-formatting utilities for chapter content.

export interface FormatOptions {
  autoLineBreak: boolean;
  dialogueSeparation: boolean;
  autoSpacing: boolean;
  typoCorrection: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  autoLineBreak: true,
  dialogueSeparation: true,
  autoSpacing: true,
  typoCorrection: true,
};

const TYPO_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /되요/g, replacement: '돼요' },
  { pattern: /됬/g, replacement: '됐' },
  { pattern: /됄/g, replacement: '될' },
  { pattern: /됀/g, replacement: '된' },
  { pattern: /왠만/g, replacement: '웬만' },
  { pattern: /몇일/g, replacement: '며칠' },
  { pattern: /어의/g, replacement: '어이' },
  { pattern: /희안/g, replacement: '희한' },
  { pattern: /금새/g, replacement: '금세' },
  { pattern: /요세/g, replacement: '요새' },
  { pattern: /역활/g, replacement: '역할' },
  { pattern: /설겆이/g, replacement: '설거지' },
  { pattern: /뵈요/g, replacement: '봬요' },
  { pattern: /아니예요/g, replacement: '아니에요' },
  { pattern: /어떻해/g, replacement: '어떡해' },
];

export function correctTypos(text: string): string {
  return TYPO_RULES.reduce(
    (result, { pattern, replacement }) => result.replace(pattern, replacement),
    text
  );
}

export function autoLineBreak(text: string): string {
  return text
    .replace(/([.!?])\s+([A-Z0-9"'])/g, '$1\n$2')
    .replace(/([.!?])([A-Z0-9"'])/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n');
}

export function separateDialogue(text: string): string {
  return text
    .replace(/([.,!?])\s*(["'])/g, '$1\n$2')
    .replace(/(["'])\s*([A-Za-z0-9])/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n');
}

export function autoSpacing(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/([.,!?])([^\s\n])/g, '$1 $2')
    .trim();
}

export function formatPlainText(text: string, options: Partial<FormatOptions> = {}): string {
  const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  let result = text;

  if (opts.typoCorrection) result = correctTypos(result);
  if (opts.autoSpacing) result = autoSpacing(result);
  if (opts.dialogueSeparation) result = separateDialogue(result);
  if (opts.autoLineBreak) result = autoLineBreak(result);

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

export function formatHtmlContent(html: string, options: Partial<FormatOptions> = {}): string {
  const tagPlaceholders = new Map<string, string>();
  let tagIndex = 0;
  let result = html.replace(/<[^>]+>/g, (match) => {
    const placeholder = `__TAG_${tagIndex++}__`;
    tagPlaceholders.set(placeholder, match);
    return placeholder;
  });

  result = formatPlainText(result, options);

  for (const [placeholder, tag] of tagPlaceholders) {
    result = result.split(placeholder).join(tag);
  }

  return result
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^<(p|div|h[1-6]|blockquote|ul|ol|li|figure)/i.test(line)) return line;
      if (/<\/(p|div|h[1-6]|blockquote)>$/i.test(line)) return line;
      return `<p>${line}</p>`;
    })
    .join('\n');
}

export interface FormatPreview {
  original: string;
  formatted: string;
  hasChanges: boolean;
  changeCount: number;
  changes: Array<{
    type: 'lineBreak' | 'dialogue' | 'spacing';
    position: number;
    before: string;
    after: string;
  }>;
}

export function previewFormatting(
  text: string,
  options: Partial<FormatOptions> = {}
): FormatPreview {
  const formatted = formatPlainText(text, options);
  const typoChangeCount = TYPO_RULES.reduce((count, { pattern }) => {
    const matches = text.match(pattern);
    return count + (matches?.length || 0);
  }, 0);
  const lineChangeCount = Math.abs(formatted.split('\n').length - text.split('\n').length);

  return {
    original: text,
    formatted,
    hasChanges: text !== formatted,
    changeCount: typoChangeCount + lineChangeCount,
    changes: [],
  };
}

export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}
