export const NEXT_CHAPTER_SCROLL_THRESHOLD = 180;
export const NEXT_CHAPTER_TOUCH_THRESHOLD = 72;

type PageScrollMetrics = {
  viewportHeight: number;
  scrollY: number;
  scrollHeight: number;
};

export function isPageAtBottom(
  { viewportHeight, scrollY, scrollHeight }: PageScrollMetrics,
  tolerance = 6,
) {
  return viewportHeight + scrollY >= scrollHeight - tolerance;
}

export function accumulateNextChapterScroll(current: number, deltaY: number) {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0;
  return Math.min(
    NEXT_CHAPTER_SCROLL_THRESHOLD,
    Math.max(0, current) + deltaY,
  );
}
