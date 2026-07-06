import { Controller, Get, Header } from '@nestjs/common'
import { spaIndexHtml } from '../common/spa-index'

// Admin console entry. Serves the built Vue SPA (admin-ui/) — assets load from
// /ui (ServeStaticModule). This GET /admin route stays gated by
// AdminUiMiddleware (admin-role session), so the page is returned only to
// authenticated admins; the /admin/* API keeps its own X-Admin-Token guard.
@Controller()
export class AdminUiController {
  @Get('admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  page(): string {
    return spaIndexHtml()
  }
}
