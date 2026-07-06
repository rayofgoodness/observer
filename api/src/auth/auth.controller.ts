import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'
import type { Request, Response } from 'express'
import { type AuthedRequest, AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { readCookie, SESSION_COOKIE, SESSION_TTL_SECONDS } from './cookie.util'

class CredentialsDto {
  @IsEmail()
  @MaxLength(255)
  email!: string

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  })
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.register(body.email, body.password)
    setSessionCookie(res, token)
    return { ok: true }
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(body.email, body.password)
    setSessionCookie(res, token)
    return { ok: true }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.destroySession(readCookie(req, SESSION_COOKIE))
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return { id: req.user.id, email: req.user.email, role: req.user.role }
  }
}
