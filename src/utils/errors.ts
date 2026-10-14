/**
 * Error de entrada con código de acción: el Core lo devuelve como `VALIDATION` (lo que mandó
 * quien llama) y no como `INTERNAL`. Para los métodos de repositorio expuestos como acciones,
 * que no tienen un schema que valide la entrada antes de correr.
 */
export function validationError(message: string): Error {
  return Object.assign(new Error(message), { code: 'VALIDATION' });
}

/** Exige un id no vacío; sin él, Drizzle recibe `undefined` y falla con un error interno. */
export function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`Falta ${field}.`);
  }
  return value;
}
