import { Controller, Get, Header, Redirect } from '@nestjs/common'
import { spaIndexHtml } from './spa-index'

// Single-page console. The Vue SPA (admin-ui/) owns all in-app routing at base
// '/', with sign-in/registration at /auth. The server returns index.html for
// those shell routes; assets load from /ui (ServeStaticModule). Which content a
// user sees (their own projects vs the admin console) is decided client-side
// from /auth/me and enforced server-side by the API guards (AuthGuard for
// /account/*, AdminGuard for /admin/*).
@Controller()
export class SpaUiController {
  @Get(['/', 'auth'])
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  page(): string {
    return spaIndexHtml()
  }

  // Legacy URLs from the previous two-console layout — fold into the SPA root.
  @Get(['dashboard', 'admin'])
  @Redirect('/', 302)
  legacy(): void {}
}
