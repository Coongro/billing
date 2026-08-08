ALTER TABLE "module_billing_accounts" ADD COLUMN "due_date" text;--> statement-breakpoint
ALTER TABLE "module_billing_accounts" ADD COLUMN "source_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_billing_accounts_source_ref" ON "module_billing_accounts" USING btree ("source","source_ref") WHERE "module_billing_accounts"."source_ref" is not null;--> statement-breakpoint
CREATE INDEX "idx_billing_accounts_due_date" ON "module_billing_accounts" USING btree ("due_date");