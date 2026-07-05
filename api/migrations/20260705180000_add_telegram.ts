import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    // Per-project Telegram chat to notify on new errors. The bot itself is a
    // single platform bot (TELEGRAM_BOT_TOKEN); the client supplies the chat id
    // after adding the bot to their chat/group.
    table.string('telegram_chat_id', 40).nullable()
    table.boolean('telegram_enabled').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('telegram_chat_id')
    table.dropColumn('telegram_enabled')
  })
}
