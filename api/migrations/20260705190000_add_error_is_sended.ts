import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('errors', (table) => {
    // Whether this error group has been pushed to Telegram yet. New groups start
    // false; a per-minute flush job picks up the unsent ones, sends, and flips
    // this to true. Re-seen (merged) groups keep their existing value, so an
    // already-sent error never re-notifies.
    table.boolean('is_sended').notNullable().defaultTo(false)
  })
  // Partial index: the flush job only ever scans is_sended = false rows.
  await knex.raw(
    'create index errors_unsent_idx on errors (id) where is_sended = false',
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('drop index if exists errors_unsent_idx')
  await knex.schema.alterTable('errors', (table) => {
    table.dropColumn('is_sended')
  })
}
