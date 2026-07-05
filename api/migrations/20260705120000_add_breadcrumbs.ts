import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('error_occurrences', (table) => {
    table.jsonb('breadcrumbs').notNullable().defaultTo('[]')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('error_occurrences', (table) => {
    table.dropColumn('breadcrumbs')
  })
}
