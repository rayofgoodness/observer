import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    // Stored lowercased; app normalizes before insert/lookup.
    table.string('email', 255).notNullable().unique()
    table.text('password_hash').notNullable()
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
  })

  // Existing admin-created projects keep user_id = NULL (unowned). New
  // self-service projects are owned. SET NULL on delete so deleting a user
  // orphans rather than cascades their error data away.
  await knex.schema.alterTable('projects', (table) => {
    table
      .integer('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
    table.index(['user_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('user_id')
  })
  await knex.schema.dropTableIfExists('users')
}
