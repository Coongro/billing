import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

import type { RawBatch, VencEstado, SaleLote } from '../data/loteUtils.js';
import { lotesFEFO, loteRecomendado, stockVendible, repartir } from '../data/loteUtils.js';

const UI = getHostUI();
const React = getHostReact();
const { useEffect } = React;
const h = React.createElement;
const ic = (name: string, size = 16) => h(UI.DynamicIcon, { icon: name, size } as any);

const VENC_ICON: Record<VencEstado['kind'], string> = {
  vencido: 'TriangleAlert',
  pronto: 'Clock',
  ok: 'Calendar',
};
const VENC_CLS: Record<VencEstado['kind'], string> = { vencido: 'bad', pronto: 'warn', ok: 'ok' };

/** Chip de estado de vencimiento (cr-venc). */
function vencChip(estado: VencEstado) {
  return h(
    'span',
    { className: `cr-venc ${VENC_CLS[estado.kind]}` },
    ic(VENC_ICON[estado.kind], 11),
    ` ${estado.label}`
  );
}

interface LoteEditorProps {
  productName: string;
  unidad: string;
  bucketIcon: string;
  lotes: RawBatch[];
  cant: number;
  loteNro: string | null;
  onChange: (loteNro: string) => void;
  onClose: () => void;
}

/**
 * Capa "¿De qué lote sale?" (diseño Claude Design): drawer anidado (`.cr-drawer-2`) sobre el
 * cobro rápido. FEFO por defecto, permite cambiar el lote, muestra el reparto entre lotes y
 * señaliza vencimientos. Markup espejo de lote-editor.jsx con clases `cr-*`.
 */
export function LoteEditor({
  productName,
  unidad,
  bucketIcon,
  lotes,
  cant,
  loteNro,
  onChange,
  onClose,
}: LoteEditorProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fefo = lotesFEFO(lotes);
  const reco = loteRecomendado(fefo);
  const total = stockVendible(fefo);
  const seleccionado = loteNro || reco?.nro || null;
  const { tramos, faltan } = repartir(fefo, cant, seleccionado);
  const multi = tramos.length > 1;
  const insuf = faltan > 0;
  const plural = (n: number) => (n === 1 ? unidad : `${unidad}s`);
  const u = (n: number) => `${n.toLocaleString('es-AR')} ${plural(n)}`;

  const loteRow = (l: SaleLote) => {
    const isVencido = l.estado.kind === 'vencido';
    const sinStock = l.stock <= 0;
    const disabled = isVencido || sinStock;
    const selb = l.nro === seleccionado;
    const usado = tramos.find((t) => t.nro === l.nro);
    const cls = `cr-lote ${selb ? 'sel' : ''} ${disabled ? 'off' : ''} ${l.estado.kind}`;
    return h(
      'button',
      {
        key: l.nro,
        type: 'button',
        className: cls,
        disabled,
        onClick: () => !disabled && onChange(l.nro),
      } as any,
      h('span', { className: 'cr-lote-radio' }, selb ? ic('Check', 12) : null),
      h(
        'div',
        { className: 'cr-lote-main' },
        h(
          'div',
          { className: 'cr-lote-top' },
          h('span', { className: 'cr-lote-nro' }, l.nro),
          !disabled && reco && l.nro === reco.nro
            ? h('span', { className: 'cr-reco' }, ic('Zap', 10), ' Recomendado')
            : null,
          isVencido ? h('span', { className: 'cr-reco bad' }, 'Vencido') : null
        ),
        h(
          'div',
          { className: 'cr-lote-bottom' },
          vencChip(l.estado),
          h('span', { className: 'cr-lote-stock' }, `${l.stock.toLocaleString('es-AR')} disp.`)
        )
      ),
      usado
        ? h('span', { className: 'cr-lote-use' }, `−${usado.take.toLocaleString('es-AR')}`)
        : null
    );
  };

  return h(
    'div',
    { className: 'cr' },
    h('div', { className: 'cr-scrim cr-scrim-2', onClick: onClose }),
    h(
      'aside',
      {
        className: 'cr-drawer cr-drawer-2',
        role: 'dialog',
        'aria-label': '¿De qué lote sale?',
      } as any,
      // Header
      h(
        'div',
        { className: 'cr-drawer-head' },
        h(
          'div',
          { className: 'cr-head-top' },
          h(
            'button',
            { className: 'cr-iconbtn', onClick: onClose, 'aria-label': 'Volver' } as any,
            ic('ChevronRight', 16)
          ),
          h(
            'button',
            { className: 'cr-iconbtn', onClick: onClose, 'aria-label': 'Cerrar' } as any,
            ic('X', 16)
          )
        ),
        h(
          'h2',
          { className: 'cr-drawer-title', style: { fontSize: '21px' } },
          '¿De qué lote sale?'
        ),
        h(
          'div',
          { className: 'cr-ctx' },
          h('div', { className: 'cr-ctx-ic' }, ic(bucketIcon, 20)),
          h(
            'div',
            { style: { minWidth: 0 } },
            h('div', { className: 'cr-ctx-name' }, productName),
            h(
              'div',
              { className: 'cr-ctx-meta' },
              'Vendés ',
              h('strong', null, u(cant)),
              h('span', { className: 'cr-dot' }, '·'),
              ` ${total.toLocaleString('es-AR')} disponibles en total`
            )
          )
        )
      ),
      // Body
      h(
        'div',
        { className: 'cr-drawer-body' },
        insuf
          ? h(
              'div',
              { className: 'cr-note bad' },
              ic('TriangleAlert', 16),
              h(
                'div',
                null,
                'No alcanza el stock vendible: faltan ',
                h('strong', null, u(faltan)),
                '. Bajá la cantidad o reponé el producto.'
              )
            )
          : null,
        multi
          ? h(
              'div',
              { className: 'cr-fld' },
              h(
                'span',
                { className: 'cr-label' },
                ic('Layers', 13),
                ` Se reparte entre ${tramos.length} lotes`
              ),
              h(
                'div',
                { className: 'cr-reparto' },
                ...tramos.map((t, i) =>
                  h(
                    'div',
                    { className: 'cr-reparto-row', key: t.nro },
                    h('span', { className: 'cr-reparto-step' }, String(i + 1)),
                    h('span', { className: 'cr-reparto-nro' }, t.nro),
                    vencChip(t.estado),
                    h(
                      'span',
                      { className: 'cr-reparto-take' },
                      h('strong', null, t.take.toLocaleString('es-AR')),
                      ' u.'
                    )
                  )
                )
              ),
              h(
                'div',
                { className: 'cr-reparto-foot' },
                'Empieza por el lote elegido y sigue por vencimiento.'
              )
            )
          : null,
        h(
          'div',
          { className: 'cr-fld' },
          h(
            'span',
            { className: 'cr-label' },
            'Lotes disponibles ',
            h('span', { className: 'cr-opt' }, `· ${fefo.length}`)
          ),
          h('div', { className: 'cr-lotes' }, ...fefo.map(loteRow))
        ),
        h(
          'div',
          { className: 'cr-note info' },
          ic('Info', 15),
          h(
            'div',
            null,
            'Por defecto se descuenta del ',
            h('strong', null, 'lote que vence primero'),
            ', así no se vence el stock. Cambialo solo para casos puntuales.'
          )
        )
      ),
      // Footer
      h(
        'div',
        { className: 'cr-drawer-foot' },
        h(
          UI.Button,
          { variant: 'brand', disabled: insuf, onClick: onClose, style: { width: '100%' } } as any,
          ic('Check', 15),
          ' Usar este lote'
        )
      )
    )
  );
}
