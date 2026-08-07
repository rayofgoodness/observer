import { BadRequestException } from '@nestjs/common'

export const ERROR_STATUSES = ['new', 'resolved', 'ignored'] as const

/**
 * Validate an optional `?status=` filter used by destructive routes. A typo must
 * never widen the delete to every error, so anything unknown is rejected loudly
 * instead of being dropped.
 */
export function parseStatusFilter(status?: string): string | undefined {
  if (!status) return undefined
  if (!(ERROR_STATUSES as readonly string[]).includes(status)) {
    throw new BadRequestException(
      `status must be one of: ${ERROR_STATUSES.join(', ')}`,
    )
  }
  return status
}
