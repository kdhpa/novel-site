import { headers } from 'next/headers';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export default async function JsonLd({ data }: JsonLdProps) {
  const nonce = (await headers()).get('x-nonce') || undefined;

  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
