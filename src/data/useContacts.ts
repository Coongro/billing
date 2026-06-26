import { getHostReact, actions } from '@coongro/plugin-sdk';

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
        const rows = await actions.execute<ContactOption[]>('contacts.list');
        if (active) setOptions((rows ?? []).map((c) => ({ id: c.id, name: c.name })));
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
