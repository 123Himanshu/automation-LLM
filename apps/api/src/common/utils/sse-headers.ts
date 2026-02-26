import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Build headers for SSE streaming responses that include proper CORS.
 *
 * When using `reply.raw.writeHead()` + `reply.raw.write()` for SSE,
 * Fastify's CORS middleware never flushes its headers because `reply.send()`
 * is never called. This utility manually adds the CORS headers so
 * cross-origin streaming works correctly.
 *
 * Accepts an optional `req` parameter for reliable origin extraction.
 */
export function buildSSEHeaders(
  reply: FastifyReply,
  req?: FastifyRequest,
): Record<string, string> {
  // Extract origin from explicit request, Fastify reply.request, or raw headers
  const origin =
    (req?.headers?.['origin'] as string | undefined) ??
    (reply.request?.headers?.['origin'] as string | undefined);

  const normalized = (origin ?? '').replace(/\/+$/, '');

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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
