CREATE TABLE "module_billing_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"method" text NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
