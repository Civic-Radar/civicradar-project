import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    // The RLS attack tests talk to the real Supabase project; run them with
    // `npm run test:security` (vitest.security.config.ts).
    exclude: ['__tests__/security/**', 'node_modules/**'],
  },
});
