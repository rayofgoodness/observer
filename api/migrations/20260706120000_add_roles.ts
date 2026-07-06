import type { Knex } from 'knex'

// Role-based access. `roles` is a tiny lookup table (admin / user); every user
// gets a role_id. The /admin console is gated to the `admin` role via
// AdminUiMiddleware; everything else defaults to `user`.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary()
    table.string('name', 50).notNullable().unique()
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
  })

  await knex('roles').insert([{ name: 'admin' }, { name: 'user' }])

  const userRole = await knex('roles').where({ name: 'user' }).first('id')

  await knex.schema.alterTable('users', (table) => {
    // Nullable + SET NULL on delete so removing a role never deletes users.
    table
      .integer('role_id')
      .nullable()
      .references('id')
      .inTable('roles')
      .onDelete('SET NULL')
    table.index(['role_id'])
  })

  // Existing users become plain `user`s; promote an admin manually in the DB.
  await knex('users').update({ role_id: userRole.id })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('role_id')
  })
  await knex.schema.dropTableIfExists('roles')
}
