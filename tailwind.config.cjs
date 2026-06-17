// Extiende el preset core para generar las utilidades cg-* que usan las vistas
// del plugin (paleta gold/sky/pink/teal/neutral + serif/sans + radios). El CSS
// propio del plugin se inyecta vía assets.styles; con el fix COONG-209 el
// stylesheet del plugin queda cargado durante la sesión, sin carrera de layout.
// preflight:false evita duplicar el reset del host (mismo patrón que patients).
const baseConfig = require('../../packages/tailwind-config/index.cjs');

module.exports = {
  presets: [baseConfig],
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
