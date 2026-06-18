import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect } = React;

/**
 * Breakpoint vía matchMedia en vez de utilidades `sm:grid-cols-*`. El layout en
 * grid responsivo de Tailwind es frágil entre plugins: cada plugin embebe su
 * propia tailwind.css con la regla base `.grid-cols-1`, y si otra se carga
 * DESPUÉS de la de billing, su `.grid-cols-1` (misma especificidad, más tarde en
 * el cascade) le gana al `@media sm:grid-cols-3` y colapsa la grilla a 1 columna.
 * Resolver el ancho en JS + style inline evita depender de ese orden de carga.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/** Columnas de grilla resueltas en JS (style inline gana sobre clases externas). */
export function gridCols(n: number, wide: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: wide ? `repeat(${n}, minmax(0, 1fr))` : '1fr',
    gap: 16,
  };
}
