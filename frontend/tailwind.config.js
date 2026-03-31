/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },

      colors: {
        // ── Navy scale (sidebar, headings, deep elements) ──────────────────
        navy: {
          950: '#030D1A',
          900: '#071525',
          800: '#0B1E35',
          700: '#102848',
          600: '#163460',
          500: '#1D4480',
          400: '#2B5EA0',
          300: '#4A80C4',
          200: '#85AEDE',
          100: '#C2D5EE',
          50:  '#EBF2FA',
        },

        // ── Primary brand blue (CTAs, links, active states) ──────────────
        primary: {
          50:  '#EBF1FF',
          100: '#D1E2FF',
          200: '#A3C5FF',
          300: '#6BA3FF',
          400: '#3B7BF8',
          500: '#1A5CE8',
          600: '#1346CC',
          700: '#0E34A8',
          800: '#092685',
          900: '#061C62',
        },

        // ── Accent orange (StallionSI brand, highlights, badges) ─────────
        accent: {
          50:  '#FFF5EB',
          100: '#FFE6C7',
          200: '#FFCC8F',
          300: '#FFAD57',
          400: '#FF8F28',
          500: '#F97316',
          600: '#E05A00',
          700: '#C24900',
          800: '#9C3B00',
          900: '#7A2D00',
        },

        // ── Emerald (paid / success) ─────────────────────────────────────
        emerald: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
        },

        // ── Rose (overdue / danger) ───────────────────────────────────────
        rose: {
          50:  '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
        },

        // ── Amber (partial / warning) ─────────────────────────────────────
        amber: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },

        // ── Blue (existing uses, charts) ──────────────────────────────────
        blue: {
          50:  '#EBF1FF',
          100: '#D1E2FF',
          200: '#A3C5FF',
          300: '#6BA3FF',
          400: '#3B7BF8',
          500: '#1A5CE8',
          600: '#1346CC',
          700: '#0E34A8',
          800: '#092685',
          900: '#061C62',
        },

        // ── Slate (neutral text / borders / bg) ───────────────────────────
        slate: {
          50:  '#F0F5FB',
          100: '#E4EDF7',
          200: '#CDDAED',
          300: '#9DB5CE',
          400: '#6A8FAE',
          500: '#46698A',
          600: '#314F6A',
          700: '#1E3650',
          800: '#112438',
          900: '#071525',
          950: '#040F1C',
        },

        // ── Gray (mirrors slate for mixed usage) ─────────────────────────
        gray: {
          50:  '#F0F5FB',
          100: '#E4EDF7',
          200: '#CDDAED',
          300: '#9DB5CE',
          400: '#6A8FAE',
          500: '#46698A',
          600: '#314F6A',
          700: '#1E3650',
          800: '#112438',
          900: '#071525',
        },

        // ── Teal ──────────────────────────────────────────────────────────
        teal: {
          50:  '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          400: '#2DD4BF',
          500: '#0D9488',
          600: '#0F766E',
          700: '#115E59',
        },

        // ── Semantic one-shot tokens ──────────────────────────────────────
        background:    '#EBF0F8',
        surface:       '#FFFFFF',
        border:        '#DDE6F2',
        textPrimary:   '#071525',
        textSecondary: '#46698A',
        accent2:       '#0D9488',
      },

      boxShadow: {
        'card':    '0 1px 3px rgba(7,21,37,0.07), 0 1px 2px rgba(7,21,37,0.05)',
        'card-md': '0 4px 16px rgba(7,21,37,0.10), 0 1px 4px rgba(7,21,37,0.06)',
        'card-lg': '0 8px 32px rgba(7,21,37,0.13), 0 2px 8px rgba(7,21,37,0.07)',
        'glow':    '0 0 0 3px rgba(26,92,232,0.18)',
        'glow-accent': '0 0 0 3px rgba(249,115,22,0.20)',
        'sidebar': '4px 0 24px rgba(7,21,37,0.18)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
