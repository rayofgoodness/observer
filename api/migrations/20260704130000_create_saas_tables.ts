import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (table) => {
    table.increments('id').primary()
    table.string('name', 100).notNullable()
    table.string('public_key', 60).notNullable().unique()
    table.jsonb('allowed_origins').notNullable().defaultTo('[]')
    table.integer('rate_limit_per_minute').notNullable().defaultTo(600)
    table.boolean('is_active').notNullable().defaultTo(true)
    table.boolean('ai_jira_enabled').notNullable().defaultTo(false)
    table.string('jira_base_url', 255).nullable()
    table.string('jira_email', 255).nullable()
    table.text('jira_api_token_encrypted').nullable()
    table.string('jira_project_key', 30).nullable()
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('errors', (table) => {
    table.increments('id').primary()
    table
      .integer('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE')
    table.string('fingerprint', 64).notNullable()
    table.text('message').notNullable()
    table.text('stack').notNullable().defaultTo('')
    table.string('source', 20).notNullable().defaultTo('unknown')
    table.string('status', 20).notNullable().defaultTo('new')
    table.string('jira_key', 30).nullable()
    table.integer('occurrences_count').notNullable().defaultTo(1)
    table
      .timestamp('first_seen', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
    table
      .timestamp('last_seen', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
    table.unique(['project_id', 'fingerprint'])
    table.index(['project_id', 'status', 'last_seen'])
  })

  await knex.schema.createTable('error_occurrences', (table) => {
    table.increments('id').primary()
    table
      .integer('error_id')
      .notNullable()
      .references('id')
      .inTable('errors')
      .onDelete('CASCADE')
    table
      .integer('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE')
    table.string('user_id', 100).nullable()
    table.text('url').notNullable().defaultTo('')
    table.string('route', 500).notNullable().defaultTo('')
    table.jsonb('device').notNullable().defaultTo('{}')
    table.string('app_version', 50).notNullable().defaultTo('')
    table
      .timestamp('occurred_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
    table.index(['error_id', 'occurred_at'])
    table.index(['project_id', 'occurred_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('error_occurrences')
  await knex.schema.dropTableIfExists('errors')
  await knex.schema.dropTableIfExists('projects')
}
