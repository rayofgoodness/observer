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

  /** Escape for use inside a double-quoted HTML attribute (href). */
  private escAttr(s: string): string {
    return this.esc(s).replace(/"/g, '&quot;')
  }

  /** Format a Kyiv-local timestamp (uk-UA), tolerant of invalid input. */
  private fmtTime(at: string | Date): string {
    const d = at instanceof Date ? at : new Date(at)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('uk-UA', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Kyiv',
    }).format(d)
  }

  /** Format a new-error notification. */
  formatNewError(input: {
    projectName: string
    level: string
    source: string
    message: string
    url?: string
    occurrencesCount?: number
    occurredAt?: string | Date
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
    if (input.url) {
      const u = input.url.slice(0, 300)
      lines.push(`<i>url:</i> <a href="${this.escAttr(u)}">${this.esc(u)}</a>`)
    }
    if (input.occurredAt) {
      const t = this.fmtTime(input.occurredAt)
      if (t) lines.push(`<i>time:</i> ${this.esc(t)}`)
    }
    return lines.join('\n')
  }
}
