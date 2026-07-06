import { randomBytes } from 'node:crypto'
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type IORedis from 'ioredis'
import type { Knex } from 'knex'
import { hashPassword, verifyPassword } from '../common/crypto.util'
import { KNEX, REDIS } from '../database/database.module'
import { SESSION_TTL_SECONDS } from './cookie.util'

export interface User {
  id: number
  email: string
  role: string | null
}

interface UserRow extends User {
  password_hash: string
}

// Columns to select when resolving a user, joined to their role name.
const USER_COLUMNS = ['users.id', 'users.email', 'roles.name as role'] as const

const sessionKey = (token: string) => `session:${token}`
const normalizeEmail = (email: string) => email.trim().toLowerCase()

@Injectable()
export class AuthService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  /** Create a user; returns a fresh session token. Throws on duplicate email. */
  async register(email: string, password: string): Promise<string> {
    const normalized = normalizeEmail(email)
    const existing = await this.db('users')
      .where({ email: normalized })
      .first('id')
    if (existing) throw new ConflictException('Email already registered')

    const defaultRole = await this.db('roles')
      .where({ name: 'user' })
      .first('id')
    const [user] = await this.db('users')
      .insert({
        email: normalized,
        password_hash: hashPassword(password),
        role_id: defaultRole?.id ?? null,
      })
      .returning(['id', 'email'])
    return this.createSession(user.id)
  }

  /** Verify credentials; returns a fresh session token or throws 401. */
  async login(email: string, password: string): Promise<string> {
    const user = (await this.db('users')
      .leftJoin('roles', 'roles.id', 'users.role_id')
      .where({ 'users.email': normalizeEmail(email) })
      .first(...USER_COLUMNS, 'users.password_hash')) as UserRow | undefined
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid email or password')
    }
    return this.createSession(user.id)
  }

  /** Resolve the user behind a session token, or null if invalid/expired. */
  async userFromSession(token: string | null): Promise<User | null> {
    if (!token) return null
    let userId: string | null = null
    try {
      userId = await this.redis.get(sessionKey(token))
    } catch {
      return null // Redis down — treat as unauthenticated rather than crash
    }
    if (!userId) return null
    const user = (await this.db('users')
      .leftJoin('roles', 'roles.id', 'users.role_id')
      .where({ 'users.id': Number(userId) })
      .first(...USER_COLUMNS)) as User | undefined
    return user ?? null
  }

  async destroySession(token: string | null): Promise<void> {
    if (!token) return
    try {
      await this.redis.del(sessionKey(token))
    } catch {}
  }

  private async createSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString('hex')
    await this.redis.set(
      sessionKey(token),
      String(userId),
      'EX',
      SESSION_TTL_SECONDS,
    )
    return token
  }
}
