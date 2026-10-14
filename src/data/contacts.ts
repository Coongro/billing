import { actions } from '@coongro/plugin-sdk';

interface NamedRow {
  id: string;
  name: string;
}

/**
 * Las filas de una lista, venga como arreglo o como página (`{ items, total }`): contacts pasó a
 * listas paginadas y antes devolvía el arreglo entero.
 */
export function rowsOf<T>(result: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(result)) return result;
  return result?.items ?? [];
}

/** El máximo que devuelve una página del Core: los nombres de más allá no se resuelven. */
const MAX_PAGE = { limit: 500 };

/**
 * Carga el mapa id→nombre de los contactos (clientes) de forma BLANDA: si el plugin
 * contacts no está, devuelve un mapa vacío (billing es kit-agnóstico). Compartido por
 * todas las vistas/hooks que muestran el nombre del cliente.
 */
export async function loadContactNames(): Promise<Map<string, string>> {
  const rows = await actions
    .execute<NamedRow[] | { items?: NamedRow[] }>('contacts.list', MAX_PAGE)
    .catch((): NamedRow[] => []);
  return new Map(rowsOf(rows).map((c) => [c.id, c.name]));
}

/** Igual que loadContactNames pero para las mascotas (patients). */
export async function loadPetNames(): Promise<Map<string, string>> {
  const rows = await actions
    .execute<NamedRow[] | { items?: NamedRow[] }>('patients.pets.list')
    .catch((): NamedRow[] => []);
  return new Map(rowsOf(rows).map((p) => [p.id, p.name]));
}
