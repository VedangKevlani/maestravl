import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        editorial: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        charcoal: '#141414',
        ocean: '#1a4a6e',
        sand: '#c8b89a',
        emerald: '#2d6a4f',
      },
    },
  },
  plugins: [],
}
export default config
