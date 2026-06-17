const MODULE_ID = '@coongro/billing';

interface ToastOptions {
  title: string;
  message: string;
  type?: string;
  moduleId?: string;
}

interface CoongroHost {
  toast?: { show?: (opts: ToastOptions) => void };
}

/**
 * Notificación al host (toast global). No-op si el host no expone `coongro.toast`.
 * Centralizado para no repetir el acceso a `globalThis.coongro` en cada componente.
 */
export function toast(title: string, message: string, type: 'success' | 'info' = 'info'): void {
  const host = (globalThis as { coongro?: CoongroHost }).coongro;
  host?.toast?.show?.({ title, message, type, moduleId: MODULE_ID });
}
