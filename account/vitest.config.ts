import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' }, miniflare: { bindings: { DEV_MAIL: '1', GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com, android-client.apps.googleusercontent.com' } } })],
})
