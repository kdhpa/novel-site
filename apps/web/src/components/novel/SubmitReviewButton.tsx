'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import Button, { type ButtonProps } from '@/components/ui/Button';

interface SubmitReviewButtonProps {
  novelId: string;
  disabled?: boolean;
  disabledReason?: string;
  variant?: ButtonProps['variant'];
  className?: string;
}

export default function SubmitReviewButton({
  novelId,
  disabled = false,
  disabledReason,
  variant = 'primary',
  className,
}: SubmitReviewButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;
    const confirmed = window.confirm('이 작품을 심사 요청할까요?\n\n승인되면 작품과 현재 작성된 회차가 독자에게 공개됩니다.');
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/novels/${novelId}/submit-review`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert(data.message || '심사를 요청했습니다.');
        router.refresh();
      } else {
        alert(data.error || '심사 요청에 실패했습니다.');
      }
    } catch {
      alert('심사 요청 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={handleSubmit}
      disabled={isLoading || disabled}
      title={disabled ? disabledReason : undefined}
      className={className}
    >
      {!isLoading && <Send className="mr-2 h-4 w-4" />}
      {isLoading ? '처리 중...' : '심사 요청'}
    </Button>
  );
}
