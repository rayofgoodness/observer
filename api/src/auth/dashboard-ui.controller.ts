import { Controller, Get, Header } from '@nestjs/common'
import { spaIndexHtml } from '../common/spa-index'

// Self-service dashboard entry. Serves the built Vue SPA (admin-ui/) — assets
// load from /ui (ServeStaticModule). Public HTML; the SPA's API calls rely on
// the httpOnly session cookie.
@Controller()
export class DashboardUiController {
  @Get('dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  page(): string {
    return spaIndexHtml()
  }
}
