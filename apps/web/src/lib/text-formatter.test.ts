import { describe, expect, it } from 'vitest';
import { formatHtmlContent } from './text-formatter';

describe('formatHtmlContent', () => {
  it('원래 문단과 의도한 한 줄 공백은 유지한다', () => {
    const html = '<p>첫 문단</p><p></p><p>“대사입니다.”</p>';

    expect(formatHtmlContent(html)).toBe(html);
  });

  it('과도한 빈 문단과 명백한 공백·오타만 정리한다', () => {
    const html = '<p>몇일  뒤에  만나요 .</p><p><br></p><p>&nbsp;</p><p></p><p>됬어요.</p>';

    expect(formatHtmlContent(html)).toBe(
      '<p>며칠 뒤에 만나요.</p><p></p><p>됐어요.</p>'
    );
  });

  it('강조와 삽화 같은 기존 HTML 구조를 보존한다', () => {
    const html = '<p><strong>몇일</strong>  전</p><img class="ai-illustration-img" src="/a.webp">';

    expect(formatHtmlContent(html)).toBe(
      '<p><strong>며칠</strong> 전</p><img class="ai-illustration-img" src="/a.webp">'
    );
  });
});
