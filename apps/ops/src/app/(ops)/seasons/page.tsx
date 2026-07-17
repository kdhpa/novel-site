import { redirect } from 'next/navigation';

export const metadata = {
  title: '시즌 관리',
};

export default function OpsSeasonsPage() {
  redirect('/contests');
}
