import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#07090a',
          surface: '#0d1114',
          hover: '#131820',
          card: '#10151a',
        },
        line: {
          subtle: '#181f28',
          DEFAULT: '#1e2a38',
          strong: '#253347',
        },
        ink: {
          primary: '#d6e4f0',
          secondary: '#5a7a96',
          tertiary: '#334d63',
          muted: '#1e3149',
        },
        brand: {
          DEFAULT: '#1bd96a',
          dim: '#159950',
          hover: '#16c05e',
          glow: 'rgba(27,217,106,0.12)',
          ring: 'rgba(27,217,106,0.25)',
          dark: '#0a2e18',
        },
        amber: {
          pulse: '#f59e0b',
        },
        red: {
          err: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jb-mono)', 'monospace'],
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        spin: 'spin 0.65s linear infinite',
        pulse: 'pulse 1.2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.2s ease-out forwards',
        slideIn: 'slideIn 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
