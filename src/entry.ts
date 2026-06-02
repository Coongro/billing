/**
 * @coongro/billing — Plugin lifecycle entry point
 *
 * activate() se invoca cuando el plugin se carga en un tenant.
 * Usar para seeds, listeners, o inicialización one-time.
 */

import type { ModuleActivationContext } from '@coongro/plugin-sdk';

export async function activate(context: ModuleActivationContext): Promise<void> {
  context.api.logger.info('Plugin activated');
}
