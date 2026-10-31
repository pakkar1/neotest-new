/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f1f5fb',
          100: '#e2eaf6',
          200: '#c5d5ec',
          300: '#9bb6dd',
          400: '#6a90c9',
          500: '#4671b2',
          600: '#345996',
          700: '#2b477a',
          800: '#0f2a54',
          900: '#0a1e3d',
          950: '#06142a',
        },
        brand: {
          50: '#eff8ff',
          100: '#dbeefe',
          200: '#bfe1fe',
          300: '#93cffd',
          400: '#60b4fa',
          500: '#3b96f6',
          600: '#2578eb',
          700: '#1c61d8',
          800: '#1e4faf',
          900: '#1e448a',
        },
        success: '#15803d',
        warning: '#c2410c',
        danger: '#b91c1c',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 42 84 / 0.06), 0 1px 3px 0 rgb(15 42 84 / 0.08)',
        pop: '0 12px 32px -12px rgb(15 42 84 / 0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};
