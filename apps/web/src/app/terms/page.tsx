import type { Metadata } from 'next';

export const metadata: Metadata = { title: '이용약관' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-zinc-300 sm:px-6">
      <h1 className="text-3xl font-bold text-white">이용약관</h1>
      <p className="mt-3 text-sm text-zinc-500">최종 갱신: 2026년 7월 17일</p>
      <div className="mt-8 space-y-8 leading-7">
        <section><h2 className="text-xl font-semibold text-white">서비스와 계정</h2><p className="mt-2">이용자는 본인이 관리하는 이메일로 계정을 만들고 계정 보안을 유지해야 합니다. 자동화된 남용, 제한 우회, 타인 사칭과 계정 양도는 허용되지 않습니다.</p></section>
        <section><h2 className="text-xl font-semibold text-white">게시물</h2><p className="mt-2">이용자는 게시물에 필요한 권리를 보유해야 하며 불법·침해·혐오·기만 콘텐츠를 게시할 수 없습니다. 서비스는 신고 또는 법적 요청에 따라 노출을 제한하고 기록을 보존할 수 있습니다.</p></section>
        <section><h2 className="text-xl font-semibold text-white">AI 생성 기능</h2><p className="mt-2">AI 결과는 부정확하거나 유사한 결과를 만들 수 있습니다. 이용자는 공개 전 결과와 권리를 직접 확인해야 하며, 외부 공급자의 처리 조건이 함께 적용될 수 있습니다. Gemini 기반 기능은 만 18세 이상인 이용자만 연령 확인 후 사용할 수 있습니다.</p></section>
        <section><h2 className="text-xl font-semibold text-white">심사와 공모전</h2><p className="mt-2">공개 심사와 공모전 접수 기준·기간을 따라야 합니다. 마감 뒤 접수작의 심사 대상 내용은 수정할 수 없으며, 운영자는 위반 또는 시스템 오류가 확인되면 승인·노출을 조정할 수 있습니다.</p></section>
        <section><h2 className="text-xl font-semibold text-white">책임과 변경</h2><p className="mt-2">점검·보안·법적 사유로 서비스 일부가 변경되거나 중단될 수 있습니다. 중요한 약관 변경은 서비스 내에서 사전에 알립니다.</p></section>
      </div>
    </main>
  );
}
