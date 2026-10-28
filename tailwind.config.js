/** @type {import('tailwindcss').Config} */
// Los colores NO se escriben aquí: apuntan a las variables de src/styles/tokens.css.
// Para re-marcar la app se editan los tokens, no este archivo.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // — Nombres semánticos (usar estos en código nuevo) —
        primary: { DEFAULT: token('primary'), dark: token('primary-dark'), light: token('primary-light'), fill: token('primary-fill') },
        navy: { DEFAULT: token('navy'), light: token('navy-light') },
        'on-navy': token('on-navy'),
        background: token('background'),
        surface: token('surface'),
        content: { DEFAULT: token('text'), muted: token('text-muted') },
        success: { DEFAULT: token('success'), text: token('success-text') },
        warning: { DEFAULT: token('warning'), text: token('warning-text') },
        danger: token('danger'),
        info: token('info'),

        // — Nombres anteriores: siguen funcionando y ya apuntan a la nueva identidad.
        //   Se irán reemplazando por los semánticos pantalla por pantalla. —
        ink: { DEFAULT: token('navy'), light: token('navy-light'), dark: token('text') },
        paper: { DEFAULT: token('background'), raised: token('surface') },
        cream: token('on-navy'),
        gold: { DEFAULT: token('primary'), light: token('primary-light'), dark: token('primary-dark') },
        due: token('danger'),
        paid: token('success-text'),
        line: token('line')
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px'
      }
    }
  },
  plugins: []
}
