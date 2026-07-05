import { Injectable, Logger } from '@nestjs/common'

/**
 * Thin Telegram Bot API client. One platform bot (TELEGRAM_BOT_TOKEN) sends to
 * per-project chats. Clients add the bot to their chat and provide the chat id.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly token = process.env.TELEGRAM_BOT_TOKEN ?? ''

  isConfigured(): boolean {
    return this.token.length > 0
  }

  /** Send an HTML message to a chat. Returns true on success. */
  async sendMessage(chatId: string, html: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — skipping notification')
      return false
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.text()
        this.logger.warn(`Telegram sendMessage failed ${res.status}: ${body}`)
        return false
      }
      return true
    } catch (err) {
      this.logger.warn(`Telegram sendMessage error: ${String(err)}`)
      return false
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  /** Format a new-error notification. */
  formatNewError(input: {
    projectName: string
    level: string
    source: string
    message: string
    url?: string
    occurrencesCount?: number
  }): string {
    const emoji =
      input.level === 'fatal' || input.level === 'error'
        ? '🔴'
        : input.level === 'warning'
          ? '🟠'
          : '🔵'
    const lines = [
      `${emoji} <b>${this.esc(input.level.toUpperCase())}</b> · ${this.esc(input.projectName)}`,
      '',
      `<b>${this.esc(input.message.slice(0, 400))}</b>`,
      `<i>source:</i> ${this.esc(input.source)}`,
    ]
    if (input.url)
      lines.push(`<i>url:</i> ${this.esc(input.url.slice(0, 300))}`)
    return lines.join('\n')
  }
}
