/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#04100c',
        deep: '#082018',
        panel: '#0c261d',
        line: 'rgba(255,255,255,0.08)',
        mint: '#2de2c0', // primary / actions
        inflow: '#a3e635', // money in
        outflow: '#ff8a5b', // money out
        fee: '#fbbf24', // transaction costs
        warn: '#f43f5e',
        mute: '#7fa396',
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(45,226,192,0.45)',
      },
    },
  },
  plugins: [],
}
