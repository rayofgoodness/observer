import type { Knex } from 'knex'

// The default error list (`listErrorsByPublicKey` with no status filter) does
// `where project_id = ? order by last_seen desc limit/offset` plus a count.
// The existing (project_id, status, last_seen) index can't serve that ordering
// when status is absent, forcing a sort. This composite serves both the scan
// and the count directly.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('errors', (table) => {
    table.index(['project_id', 'last_seen'], 'errors_project_lastseen_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('errors', (table) => {
    table.dropIndex(['project_id', 'last_seen'], 'errors_project_lastseen_idx')
  })
}
