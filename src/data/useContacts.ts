import { getHostReact, actions } from '@coongro/plugin-sdk';

import { rowsOf } from './contacts.js';

const React = getHostReact();
const { useState, useEffect } = React;

export interface ContactOption {
  id: string;
  name: string;
}

/**
 * Lista de clientes (contacts) para el selector del cobro rápido. Blando: si el plugin
 * contacts no está, devuelve [] y el cobro queda como venta de mostrador (sin cliente).
 */
export function useContacts(): ContactOption[] {
  const [options, setOptions] = useState<ContactOption[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await actions.execute<ContactOption[] | { items?: ContactOption[] }>(
          'contacts.list',
          { limit: 500 }
        );
        if (active) setOptions(rowsOf(rows).map((c) => ({ id: c.id, name: c.name })));
      } catch {
        if (active) setOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return options;
}
