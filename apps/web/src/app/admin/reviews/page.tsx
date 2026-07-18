import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isCurrentAdmin } from '@/lib/server/authz';

export const dynamic = 'force-dynamic';

export default async function LegacyAdminReviewsPage() {
  const session = await auth();
  if (!session?.user || !(await isCurrentAdmin(session.user.id))) notFound();

  const configured = process.env.NEXT_PUBLIC_OPS_URL;
  if (!configured) notFound();
  let target: string;
  try {
    const url = new URL('/reviews', configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) notFound();
    target = url.toString();
  } catch {
    notFound();
  }
  redirect(target);
}
