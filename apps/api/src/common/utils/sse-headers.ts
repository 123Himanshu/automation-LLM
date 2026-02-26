import type { FastifyReply } from 'fastify';

/**
 * Build headers for SSE streaming responses that include proper CORS.
 *
 * When using `reply.raw.writeHead()` + `reply.raw.write()` for SSE,
 * Fastify's CORS middleware never flushes its headers because `reply.send()`
 * is never called. This utility manually adds the CORS headers so
 * cross-origin streaming works correctly.
 */
export function buildSSEHeaders(reply: FastifyReply): Record<string, string> {
  const origin = reply.request.headers['origin'] as string | undefined;
  const normalized = (origin ?? '').replace(/\/+$/, '');

  // Match the same logic as main.ts CORS config:
  // allow exact FRONTEND_URL match or any *.vercel.app preview deploy
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const isAllowed =
    !origin ||
    allowedOrigins.includes(normalized) ||
    normalized.endsWith('.vercel.app');

  const corsHeaders: Record<string, string> = isAllowed && origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      }
    : {};

  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders,
  };
}
