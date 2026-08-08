import { describe, expect, it } from 'vitest';
import {
  accumulateNextChapterScroll,
  isPageAtBottom,
  NEXT_CHAPTER_SCROLL_THRESHOLD,
} from './reader-navigation';

describe('reader next chapter navigation', () => {
  it('문서 끝에 도달했는지 작은 오차를 허용해 판별한다', () => {
    expect(isPageAtBottom({ viewportHeight: 800, scrollY: 1_194, scrollHeight: 2_000 })).toBe(true);
    expect(isPageAtBottom({ viewportHeight: 800, scrollY: 1_100, scrollHeight: 2_000 })).toBe(false);
  });

  it('아래 방향 추가 스크롤만 누적하고 임계값에서 멈춘다', () => {
    expect(accumulateNextChapterScroll(0, 80)).toBe(80);
    expect(accumulateNextChapterScroll(80, 120)).toBe(NEXT_CHAPTER_SCROLL_THRESHOLD);
    expect(accumulateNextChapterScroll(120, -10)).toBe(0);
  });
});
