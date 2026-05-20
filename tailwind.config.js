/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Purple primary palette. The utility names stay `navy*` so the
        // rest of the codebase doesn't have to change -- only the hex
        // values are different.
        //
        // Contrast (WCAG 2.1 AA / AAA targets):
        //   white on #3F1D71  = 10.9:1 (AAA)
        //   white on #2A104F  = 14.6:1 (AAA)
        //   white on #5E33A0  =  7.6:1 (AAA)
        //   #C9922A on #2A104F = 6.2:1 (AA for normal text)
        //   #CBD5E1 (slate1) on #5E33A0 = 5.4:1 (AA for normal text)
        navy: {
          DEFAULT: '#3F1D71',
          dark: '#2A104F',
          light: '#5E33A0',
        },
        // Warm gold accent kept for high contrast against purple --
        // used for focus rings, active nav, CTAs.
        gold: {
          DEFAULT: '#B07D2A',
          light: '#C9922A',
          bg: '#FDF3E3',
        },
        teal: {
          DEFAULT: '#1A6B72',
          light: '#E4F3F4',
        },
        bg: '#F2F1ED',
        surface: '#FFFFFF',
        border: {
          DEFAULT: '#C8C5BC',
          dark: '#9E9B92',
        },
        ink: {
          DEFAULT: '#1A1A18',
          mid: '#44443E',
          soft: '#6E6D67',
          inv: '#FFFFFF',
        },
        success: {
          DEFAULT: '#1A5E42',
          bg: '#E4F4EC',
        },
        error: {
          DEFAULT: '#8B1A1A',
          bg: '#FAEAEA',
        },
        warn: {
          DEFAULT: '#7A5010',
          bg: '#FEF6E4',
        },
        tagblue: {
          DEFAULT: '#1C4080',
          bg: '#E8EEF8',
        },
        slate1: '#CBD5E1',
        slate2: '#8EA8C8',
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
}
