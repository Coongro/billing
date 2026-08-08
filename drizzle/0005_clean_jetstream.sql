ALTER TABLE "module_billing_cash_closes" ADD COLUMN "withdrawn" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "module_billing_cash_closes" ADD COLUMN "next_float" numeric;