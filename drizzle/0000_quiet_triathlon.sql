CREATE TABLE "module_billing_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact_id" uuid,
	"pet_id" uuid,
	"consultation_id" text,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"opened_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_billing_account_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit_price" numeric NOT NULL,
	"subtotal" numeric NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text
);
