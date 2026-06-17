import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/account.ts',
    './src/schema/account-line.ts',
    './src/schema/payment.ts',
    './src/schema/expense.ts',
    './src/schema/cash-close.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
});
