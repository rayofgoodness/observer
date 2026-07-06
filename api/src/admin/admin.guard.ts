import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service'
import { readCookie, SESSION_COOKIE } from '../auth/cookie.util'

/**
 * Authorizes /admin/* two ways:
 *  1. X-Admin-Token === ADMIN_TOKEN — the platform token used by scripts and the
 *     send-test-error skill.
 *  2. An authenticated session whose user has the `admin` role — so signed-in
 *     admins reach admin data straight from the console without pasting a token.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()

    const token = req.headers['x-admin-token']
    if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN)
      return true

    const user = await this.auth.userFromSession(
      readCookie(req, SESSION_COOKIE),
    )
    if (user?.role === 'admin') return true

    throw new UnauthorizedException()
  }
}
