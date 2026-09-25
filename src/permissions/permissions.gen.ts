// Generado por el Coongro Builder desde contributes.permissions. No editar a mano.

export const BillingPermissions = {
  /** Eliminar cuentas */
  accountsDelete: 'billing.accounts.delete',
  /** Gestionar cuentas */
  accountsManage: 'billing.accounts.manage',
  /** Ver cuentas */
  accountsRead: 'billing.accounts.read',
  /** Eliminar caja diaria */
  cashClosesDelete: 'billing.cashCloses.delete',
  /** Gestionar caja diaria */
  cashClosesManage: 'billing.cashCloses.manage',
  /** Ver caja diaria */
  cashClosesRead: 'billing.cashCloses.read',
  /** Eliminar los conceptos de una cuenta */
  linesDelete: 'billing.lines.delete',
  /** Gestionar los conceptos de una cuenta */
  linesManage: 'billing.lines.manage',
  /** Ver los conceptos de una cuenta */
  linesRead: 'billing.lines.read',
  /** Eliminar los cobros de una cuenta */
  paymentsDelete: 'billing.payments.delete',
  /** Gestionar los cobros de una cuenta */
  paymentsManage: 'billing.payments.manage',
  /** Ver los cobros de una cuenta */
  paymentsRead: 'billing.payments.read',
} as const;

export type BillingPermission = (typeof BillingPermissions)[keyof typeof BillingPermissions];
