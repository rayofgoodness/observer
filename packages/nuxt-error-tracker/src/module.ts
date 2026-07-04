import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  endpoint: string
  publicKey: string
  appVersion?: string
  enabled?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@yourorg/nuxt-error-tracker',
    configKey: 'errorTracker',
  },
  defaults: {
    endpoint: '',
    publicKey: '',
    appVersion: 'unknown',
    enabled: true,
  },
  setup(options, nuxt) {
    if (!options.enabled || !options.endpoint || !options.publicKey) return

    nuxt.options.runtimeConfig.public.errorTracker = {
      endpoint: options.endpoint,
      publicKey: options.publicKey,
      appVersion: options.appVersion ?? 'unknown',
    }

    const resolver = createResolver(import.meta.url)
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })
  },
})
