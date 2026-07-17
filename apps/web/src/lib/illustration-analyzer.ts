// Illustration position analyzer for auto-inserting AI illustrations into chapter content.

import { IllustrationPosition, ILLUSTRATION_MARKERS } from '@/types/illustration';

const SCENE_CHANGE_KEYWORDS = [
  'suddenly',
  'meanwhile',
  'later',
  'at that moment',
  'the next day',
  'hours later',
  'battle',
  'attack',
  'magic',
  'door',
  'light',
  'shadow',
];

const VISUAL_KEYWORDS = [
  'looked',
  'saw',
  'appeared',
  'stood',
  'walked',
  'smiled',
  'cried',
  'red',
  'blue',
  'gold',
  'black',
  'white',
  'storm',
  'fire',
  'rain',
];

export function parseHtmlToParagraphs(html: string): string[] {
  const blocks = html.split(/<\/p>|<br\s*\/?>\s*<br\s*\/?>|<\/div>/i);
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const text = block
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length >= 20) paragraphs.push(text);
  }

  return paragraphs;
}

export function findManualMarkers(paragraphs: string[]): IllustrationPosition[] {
  const positions: IllustrationPosition[] = [];

  paragraphs.forEach((paragraph, index) => {
    const marker = ILLUSTRATION_MARKERS.find((value) => paragraph.includes(value));
    if (!marker) return;

    const contextText = paragraphs
      .slice(Math.max(0, index - 2), Math.min(paragraphs.length, index + 3))
      .join(' ')
      .replace(marker, '')
      .trim();

    positions.push({
      paragraphIndex: index,
      contextText: contextText.slice(0, 500),
      suggestedPrompt: buildIllustrationPrompt(contextText),
      isManualMarker: true,
      confidence: 1,
    });
  });

  return positions;
}

function calculateSceneScore(paragraph: string, prevParagraph?: string | null): number {
  const text = paragraph.toLowerCase();
  let score = 0;

  if (SCENE_CHANGE_KEYWORDS.some((keyword) => text.includes(keyword))) score += 0.35;
  if (VISUAL_KEYWORDS.some((keyword) => text.includes(keyword))) score += 0.25;
  if (paragraph.length > 100) score += 0.15;
  if (paragraph.length > 220) score += 0.15;

  const hasDialogue = /["']/.test(paragraph);
  const prevHadDialogue = prevParagraph ? /["']/.test(prevParagraph) : false;
  if (prevHadDialogue && !hasDialogue) score += 0.15;
  if (hasDialogue && paragraph.length < 80) score -= 0.1;

  return Math.max(0, Math.min(score, 1));
}

export function analyzeSceneChanges(
  paragraphs: string[],
  maxCount: number,
  existingPositions: number[] = []
): IllustrationPosition[] {
  const candidates = paragraphs
    .map((paragraph, index) => ({
      index,
      score: existingPositions.includes(index) ? 0 : calculateSceneScore(paragraph, paragraphs[index - 1]),
      context: paragraphs.slice(Math.max(0, index - 2), Math.min(paragraphs.length, index + 3)).join(' '),
    }))
    .filter((candidate) => candidate.score > 0.15)
    .sort((a, b) => b.score - a.score);

  const selected: IllustrationPosition[] = [];
  const minSpacing = paragraphs.length < 10 ? 1 : 2;

  for (const candidate of candidates) {
    if (selected.length >= maxCount) break;
    const tooClose = [...existingPositions, ...selected.map((item) => item.paragraphIndex)].some(
      (position) => Math.abs(position - candidate.index) < minSpacing
    );
    if (tooClose) continue;

    selected.push({
      paragraphIndex: candidate.index,
      contextText: candidate.context.slice(0, 500),
      suggestedPrompt: buildIllustrationPrompt(candidate.context),
      isManualMarker: false,
      confidence: candidate.score,
    });
  }

  return selected.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
}

export function buildIllustrationPrompt(contextText: string, genre?: string): string {
  const cleanText = contextText.replace(/[""''`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const genreHint = genre ? ` ${genre} style.` : '';
  return `Illustration of a web novel scene: ${cleanText}.${genreHint} Detailed composition, high quality, dramatic lighting.`;
}

export function analyzeChapterForIllustrations(
  htmlContent: string,
  maxCount: number = 3,
  useAutoDetect: boolean = true
): { positions: IllustrationPosition[]; totalParagraphs: number } {
  const paragraphs = parseHtmlToParagraphs(htmlContent);
  const manualPositions = findManualMarkers(paragraphs);
  const remainingSlots = Math.max(0, maxCount - manualPositions.length);
  const autoPositions = useAutoDetect && remainingSlots > 0
    ? analyzeSceneChanges(paragraphs, remainingSlots, manualPositions.map((item) => item.paragraphIndex))
    : [];

  const positions = [...manualPositions, ...autoPositions].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return { positions, totalParagraphs: paragraphs.length };
}

export function removeIllustrationMarkers(html: string): string {
  return ILLUSTRATION_MARKERS.reduce((result, marker) => result.split(marker).join(''), html);
}

export function insertIllustrationAtPosition(html: string, position: number, imageUrl: string): string {
  const paragraphs = html.split(/<\/p>/i);
  if (position >= paragraphs.length) return html + createIllustrationHtml(imageUrl);
  paragraphs[position] = paragraphs[position] + '</p>' + createIllustrationHtml(imageUrl);
  return paragraphs.join('</p>').replace(/<\/p><\/p>/g, '</p>');
}

function createIllustrationHtml(imageUrl: string): string {
  return `<figure class="ai-illustration" data-ai-generated="true"><img src="${imageUrl}" alt="" loading="lazy" /></figure>`;
}

export function extractIllustrationUrls(html: string): string[] {
  const matches = html.match(/https?:\/\/[^"'\s]*chapter-illustrations\/[^"'\s]+/g) || [];
  return [...new Set(matches)];
}

export function extractStoragePathFromUrl(url: string): string | null {
  const match = url.match(/chapter-illustrations\/(.+)$/);
  return match ? match[1] : null;
}
