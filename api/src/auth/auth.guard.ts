import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService, type User } from './auth.service'
import { readCookie, SESSION_COOKIE } from './cookie.util'

export interface AuthedRequest extends Request {
  user: User
}

/** Guards account endpoints: resolves the session cookie to a user or 401. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = readCookie(req, SESSION_COOKIE)
    const user = await this.auth.userFromSession(token)
    if (!user) throw new UnauthorizedException('Not signed in')
    ;(req as AuthedRequest).user = user
    return true
  }
}
