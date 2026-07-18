import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보 처리 안내' };

const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || '서비스 운영 문의 채널';

function contactHref(value: string) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function configuredDays(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export default function PrivacyPage() {
  const viewDays = configuredDays('CONTENT_VIEW_RETENTION_DAYS', 90, 7, 365);
  const imageJobDays = configuredDays('IMAGE_JOB_RETENTION_DAYS', 30, 7, 365);
  const moderationDays = configuredDays(
    'MODERATION_RECORD_RETENTION_DAYS',
    365,
    30,
    3_650
  );
  const backupDays = configuredDays('BACKUP_RETENTION_DAYS', 30, 1, 3_650);
  const contactUrl = contactHref(contact);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-zinc-300 sm:px-6">
      <h1 className="text-3xl font-bold text-white">개인정보 처리 안내</h1>
      <p className="mt-3 text-sm text-zinc-500">최종 갱신: 2026년 7월 17일</p>

      <div className="mt-8 space-y-8 leading-7">
        <section>
          <h2 className="text-xl font-semibold text-white">수집·이용 항목</h2>
          <p className="mt-2">계정 운영을 위해 이메일, 닉네임, 로그인 공급자 식별자와 보안 로그를 처리합니다. 서재·좋아요·댓글·리뷰·읽기 진행도와 사용자가 작성한 작품 데이터를 서비스 제공 목적으로 저장합니다.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white">AI 기능의 외부 전송</h2>
          <p className="mt-2">사용자가 AI 기능을 실행한 경우에만 표지 설명, 캐릭터 외형, 프롬프트 또는 회차 문맥 일부가 암호화된 통신으로 Google Gemini와 Replicate의 국외 처리 시설에 생성 요청 목적으로 전송될 수 있습니다. Replicate API 예측의 입력·출력·로그는 공급자에서 기본 1시간 뒤 제거되며, 서비스가 채택한 결과 이미지는 서비스 저장소에 별도로 보관됩니다. Gemini의 처리·로그 보존은 운영 계정의 유료 등급과 프로젝트 설정에 따르며, 공급자 정책을 확인한 구성만 프로덕션에서 활성화합니다. Gemini 기반 기능은 만 18세 이상 확인 후에만 요청할 수 있습니다. 자세한 최신 조건은 <a className="text-indigo-400 hover:underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API 약관</a>과 <a className="text-indigo-400 hover:underline" href="https://replicate.com/docs/topics/predictions/data-retention/" target="_blank" rel="noreferrer">Replicate 보존 안내</a>를 확인하세요. 민감정보나 타인의 개인정보를 입력하지 마세요.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white">보존과 삭제</h2>
          <p className="mt-2">조회 중복 방지 식별자는 {viewDays}일, 완료된 AI 작업 기록은 {imageJobDays}일 후 정리합니다. 미해결 신고는 검토가 끝날 때까지 보존합니다. 신고 당시 댓글·리뷰의 제한된 원문 사본, 신고 설명·처리 결과와 관리자 감사 기록은 분쟁 대응과 서비스 안전을 위해 관리자만 접근할 수 있도록 제한하고, 해결 후 {moderationDays}일 뒤 정리합니다. 계정 삭제 시 이 기록의 계정 연결 식별자는 제거하지만 신고 원문 자체에 이용자가 입력한 개인정보가 포함될 수 있습니다. 그 밖의 계정·작성 데이터는 계정 삭제 요청 처리 시 삭제하거나 비식별화하며, 운영 백업은 최대 {backupDays}일의 순환 기간 뒤 제거됩니다.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white">보호와 권리</h2>
          <p className="mt-2">전송구간 암호화, 비밀번호 해시, 최소 권한, 접근 감사와 요청 제한을 적용합니다. 이용자는 자신의 정보 열람·정정·삭제·처리 제한을 요청할 수 있습니다. 정지되었거나 로그인할 수 없는 계정은 아래 개인정보 문의 채널로 요청하면 등록 이메일을 통한 본인 확인 후 처리합니다. 운영팀은 요청 접수를 7일 이내 안내하고, 확인 완료 후 30일 이내 처리를 내부 목표로 합니다.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white">문의</h2>
          <p className="mt-2">
            개인정보 문의:{' '}
            {contactUrl ? (
              <a className="text-indigo-400 hover:underline" href={contactUrl}>
                {contact}
              </a>
            ) : contact}
          </p>
        </section>
      </div>
    </main>
  );
}
