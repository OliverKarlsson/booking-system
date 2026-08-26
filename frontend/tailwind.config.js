/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // A deliberately small token set: one neutral ramp, one accent, and two
        // status colours. Features should reach for these rather than picking from
        // Tailwind's full palette, so the UI stays coherent across four agents'
        // worth of independently written screens.
        ink: {
          50: '#f7f8f9',
          100: '#eef0f2',
          200: '#dde1e6',
          300: '#c2c9d1',
          400: '#98a2ae',
          500: '#6f7b8a',
          600: '#55606e',
          700: '#414a56',
          800: '#2d343d',
          900: '#1b2027',
        },
        accent: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bdd2ff',
          300: '#90b3ff',
          400: '#5d8bff',
          500: '#3563e9',
          600: '#264cc4',
          700: '#1f3d9c',
          800: '#1d357d',
          900: '#1c2f66',
        },
        success: {
          100: '#dcfce7',
          600: '#16a34a',
          800: '#166534',
        },
        danger: {
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          800: '#991b1b',
        },
        warning: {
          100: '#fef3c7',
          600: '#d97706',
          800: '#92400e',
        },
      },
      spacing: {
        // Named page rhythm tokens so gutters and section gaps stay identical
        // between features without every screen re-deciding.
        gutter: '1.5rem',
        section: '2rem',
      },
      maxWidth: {
        page: '80rem',
      },
      borderRadius: {
        card: '0.75rem',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
