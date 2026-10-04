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
  /** Eliminar conceptos de cuentas */
  linesDelete: 'billing.lines.delete',
  /** Gestionar conceptos de cuentas */
  linesManage: 'billing.lines.manage',
  /** Ver conceptos de cuentas */
  linesRead: 'billing.lines.read',
  /** Eliminar cobros */
  paymentsDelete: 'billing.payments.delete',
  /** Registrar cobros */
  paymentsManage: 'billing.payments.manage',
  /** Ver cobros */
  paymentsRead: 'billing.payments.read',
} as const;

export type BillingPermission = (typeof BillingPermissions)[keyof typeof BillingPermissions];
