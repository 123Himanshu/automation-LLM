import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Basic ')) {
      throw new UnauthorizedException('Missing Basic Auth credentials');
    }

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) {
      throw new UnauthorizedException('Invalid credentials format');
    }

    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);

    const expectedUser = (this.config.get<string>('BASIC_AUTH_USERNAME') ?? '').replace(/^"|"$/g, '');
    const expectedPass = (this.config.get<string>('BASIC_AUTH_PASSWORD') ?? '').replace(/^"|"$/g, '');

    // Constant-time comparison to prevent timing attacks
    const userMatch = this.safeCompare(username, expectedUser);
    const passMatch = this.safeCompare(password, expectedPass);

    if (!userMatch || !passMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return true;
  }

  /** Constant-time string comparison using crypto.timingSafeEqual */
  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');

    // timingSafeEqual requires equal-length buffers.
    // Pad the shorter one so we always compare in constant time,
    // but still reject if lengths differ.
    if (bufA.length !== bufB.length) {
      // Compare against self to burn the same CPU time, then return false
      const padded = Buffer.alloc(bufA.length);
      timingSafeEqual(bufA, padded);
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }
}
