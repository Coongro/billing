import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/schema/account.ts', './src/schema/account-line.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
});
