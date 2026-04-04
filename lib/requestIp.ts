import type { NextRequest } from 'next/server';

/**
 * Política explícita de headers confiáveis para extração de IP real.
 *
 * Só confiamos em headers normalmente injetados por um proxy/CDN controlado
 * na borda. O app não deve ser exposto diretamente à internet com esses
 * headers aceitos sem um proxy de confiança à frente.
 */
const TRUSTED_IP_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
] as const;

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value
    .split(',')[0]
    ?.trim()
    .replace(/^\[|\]$/g, '');

  return first || null;
}

export function getRequestIp(request: NextRequest): string {
  for (const header of TRUSTED_IP_HEADERS) {
    const candidate = firstForwardedIp(request.headers.get(header));
    if (candidate) return candidate;
  }

  return 'unknown';
}

export { TRUSTED_IP_HEADERS };
