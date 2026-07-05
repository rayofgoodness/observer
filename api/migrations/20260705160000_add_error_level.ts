import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('errors', (table) => {
    // Severity: fatal | error | warning | info | debug. Defaults to 'error'
    // so existing rows and clients that don't send a level stay valid.
    table.string('level', 20).notNullable().defaultTo('error')
    table.index(['project_id', 'level', 'last_seen'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('errors', (table) => {
    table.dropIndex(['project_id', 'level', 'last_seen'])
    table.dropColumn('level')
  })
}
