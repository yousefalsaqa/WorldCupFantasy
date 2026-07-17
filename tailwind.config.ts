import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // La Liga inspired palette - rich, vibrant Spanish football feel
        laliga: {
          navy: '#1a1f3a',
          gold: '#f5a623',
          red: '#e63946',
          orange: '#ff6b35',
          cream: '#faf3e0',
          dark: '#0d1117',
          darker: '#010409',
        },
        // UI colors
        surface: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        // Position colors
        position: {
          gk: '#f59e0b',
          def: '#22c55e',
          mid: '#3b82f6',
          fwd: '#ef4444',
        },
        // Landing-page identity: warm off-white ink on near-black navy,
        // magenta as the sparing brand accent, thin red for live info.
        ink: '#F3ECDF',
        accent: {
          DEFAULT: '#D6296B',
          dim: '#7A1B41',
        },
        live: '#E23A3A',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-bebas)', 'Impact', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'laliga-gradient': 'linear-gradient(135deg, #1a1f3a 0%, #0d1117 50%, #1a1f3a 100%)',
        'gold-gradient': 'linear-gradient(135deg, #f5a623 0%, #ff6b35 100%)',
        'pitch-gradient': 'linear-gradient(180deg, #1a472a 0%, #2d5a3d 50%, #1a472a 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(245, 166, 35, 0.3)',
        'glow-strong': '0 0 40px rgba(245, 166, 35, 0.5)',
        'inner-glow': 'inset 0 0 20px rgba(245, 166, 35, 0.1)',
      }
    },
  },
  plugins: [],
};

export default config;


