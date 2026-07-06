import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { readCookie, SESSION_COOKIE } from '../auth/cookie.util'

/**
 * Gates the /admin console page behind an authenticated session with the
 * `admin` role. Unauthenticated visitors are redirected to /dashboard to log
 * in; signed-in non-admins get a 403. The /admin/* API endpoints keep their
 * own X-Admin-Token guard (AdminGuard) on top of this.
 */
@Injectable()
export class AdminUiMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE)
    const user = await this.auth.userFromSession(token)

    if (!user) {
      res.redirect(302, '/dashboard')
      return
    }
    if (user.role !== 'admin') {
      res
        .status(403)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Forbidden</title>' +
            '<body style="font:14px system-ui;background:#0b0e14;color:#e6e9f0;padding:40px">' +
            '<h1>403 · Admin only</h1><p>Your account does not have admin access. ' +
            '<a style="color:#5b8cff" href="/dashboard">Back to dashboard</a></p>',
        )
      return
    }
    next()
  }
}
