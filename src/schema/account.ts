import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const accountTable = pgTable(
  'module_billing_accounts',
  {
    id: uuid('id').primaryKey().notNull(),
    contact_id: uuid('contact_id'),
    pet_id: uuid('pet_id'),
    consultation_id: text('consultation_id'),
    source: text('source').notNull(),
    status: text('status').notNull(),
    /**
     * Cuándo hay que pagar esta cuenta. En una consulta veterinaria se cobra en el
     * acto y no aplica; un alquiler vence un día concreto, y de eso dependen la mora
     * y el punitorio. DateKey (`YYYY-MM-DD`): es un día de calendario.
     */
    due_date: text('due_date'),
    /**
     * Qué originó la cuenta, en el vocabulario de quien la creó — por ejemplo
     * `<leaseId>:2026-08` para el alquiler de agosto de un contrato.
     *
     * Es lo que hace **idempotente** la generación automática: antes de crear, quien
     * genera busca por (`source`, `source_ref`) y si ya existe no duplica. Sin esto,
     * apretar dos veces «generar el mes» le cobraría el alquiler dos veces al
     * inquilino.
     */
    source_ref: text('source_ref'),
    // Dirección del dinero: 'receivable' = por cobrar (Cobros — un cliente nos debe);
    // 'payable' = por pagar (Salidas — le debemos a un proveedor). Convierte este ledger
    // (cuenta + líneas + pagos → estado derivado) en un motor genérico AR/AP reutilizable
    // por cualquier kit. DEFAULT 'receivable' para no cambiar el comportamiento existente
    // (Cobros/Caja/Deudores filtran receivable); NOT NULL + DEFAULT por la regla de plugins.
    direction: text('direction').notNull().default('receivable'),
    notes: text('notes'),
    opened_at: timestamp('opened_at', { mode: 'string' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    // La idempotencia se garantiza en la base, no solo en el código: dos pedidos
    // simultáneos de «generar el mes» pasarían los dos por el chequeo previo y
    // crearían la cuenta dos veces. Parcial, porque las cuentas cargadas a mano no
    // tienen `source_ref` y no deben chocar entre sí.
    sourceRefIdx: uniqueIndex('idx_billing_accounts_source_ref')
      .on(t.source, t.source_ref)
      .where(sql`${t.source_ref} is not null`),
    dueDateIdx: index('idx_billing_accounts_due_date').on(t.due_date),
  })
);

export type AccountRow = typeof accountTable.$inferSelect;
export type NewAccountRow = typeof accountTable.$inferInsert;
