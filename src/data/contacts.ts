import { actions } from '@coongro/plugin-sdk';

interface NamedRow {
  id: string;
  name: string;
}

/**
 * Carga el mapa id→nombre de los contactos (clientes) de forma BLANDA: si el plugin
 * contacts no está, devuelve un mapa vacío (billing es kit-agnóstico). Compartido por
 * todas las vistas/hooks que muestran el nombre del cliente.
 */
export async function loadContactNames(): Promise<Map<string, string>> {
  const rows = await actions.execute<NamedRow[]>('contacts.list').catch((): NamedRow[] => []);
  return new Map((rows ?? []).map((c) => [c.id, c.name]));
}

/** Igual que loadContactNames pero para las mascotas (patients). */
export async function loadPetNames(): Promise<Map<string, string>> {
  const rows = await actions.execute<NamedRow[]>('patients.pets.list').catch((): NamedRow[] => []);
  return new Map((rows ?? []).map((p) => [p.id, p.name]));
}
