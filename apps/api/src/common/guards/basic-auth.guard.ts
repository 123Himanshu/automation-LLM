import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(BasicAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Basic ')) {
      this.logger.warn(`Auth rejected: no Basic header present. Header: ${authHeader ? '[redacted non-basic]' : '[missing]'}`);
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

    const rawUser = this.config.get<string>('BASIC_AUTH_USERNAME') ?? '';
    const rawPass = this.config.get<string>('BASIC_AUTH_PASSWORD') ?? '';
    const expectedUser = rawUser.replace(/^"|"$/g, '');
    const expectedPass = rawPass.replace(/^"|"$/g, '');

    // DEBUG: log lengths and first/last chars to diagnose mismatch (remove after fix)
    this.logger.debug(
      `Auth debug — received user: "${username}" (len=${username.length}), ` +
      `expected user raw: len=${rawUser.length}, cleaned: len=${expectedUser.length} | ` +
      `received pass len=${password.length}, expected pass raw len=${rawPass.length}, cleaned len=${expectedPass.length}`,
    );

    // Constant-time comparison to prevent timing attacks
    const userMatch = this.safeCompare(username, expectedUser);
    const passMatch = this.safeCompare(password, expectedPass);

    if (!userMatch || !passMatch) {
      this.logger.warn(`Auth rejected: userMatch=${userMatch}, passMatch=${passMatch}`);
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
