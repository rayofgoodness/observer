import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type IORedis from 'ioredis'
import { REDIS } from '../database/database.module'
import { ProjectsService } from './projects.service'

@Injectable()
export class ProjectAuthGuard implements CanActivate {
  constructor(
    private readonly projects: ProjectsService,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const publicKey = request.headers['x-public-key'] ?? request.query.key
    if (typeof publicKey !== 'string' || !publicKey) {
      throw new UnauthorizedException('Missing public key')
    }

    const project = await this.projects.findByPublicKey(publicKey)
    if (!project) throw new UnauthorizedException('Invalid public key')

    const origins: string[] = Array.isArray(project.allowed_origins)
      ? project.allowed_origins
      : JSON.parse((project.allowed_origins as unknown as string) || '[]')

    if (origins.length) {
      const origin = request.headers.origin ?? ''
      if (!origins.includes(origin)) {
        throw new UnauthorizedException('Origin not allowed')
      }
    }

    const minute = Math.floor(Date.now() / 60_000)
    const rlKey = `rl:${project.id}:${minute}`
    const count = await this.redis.incr(rlKey)
    if (count === 1) await this.redis.expire(rlKey, 90)
    if (count > project.rate_limit_per_minute) {
      throw new HttpException('Rate limit exceeded', 429)
    }

    request.project = project
    return true
  }
}
