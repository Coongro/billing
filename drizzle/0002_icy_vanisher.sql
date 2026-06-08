CREATE TABLE "module_billing_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amount" numeric NOT NULL,
	"category" text NOT NULL,
	"spent_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "module_billing_cash_closes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_day" text NOT NULL,
	"opening_float" numeric DEFAULT '0' NOT NULL,
	"expected_cash" numeric NOT NULL,
	"counted_cash" numeric NOT NULL,
	"difference" numeric NOT NULL,
	"closed_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
