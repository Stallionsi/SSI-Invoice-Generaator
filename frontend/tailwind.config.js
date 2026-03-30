/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {

        // ─────────────────────────────────────────────────────────────────────
        // GLOBAL SCALE OVERRIDES
        // Every component using slate-*, blue-*, or gray-* inherits these
        // values automatically — no component changes required.
        // ─────────────────────────────────────────────────────────────────────

        // Neutral scale — replaces all slate-* usage
        // slate-100 = app shell background (#E6ECF3)
        // slate-50  = subtle hover / table header (#EEF2F7)
        // slate-200 = borders (#CBD5E1)
        // slate-500 = secondary text (#475569)
        // slate-900 = primary text (#0F172A)
        slate: {
          50:  '#EEF2F7',
          100: '#E6ECF3',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#475569',
          600: '#334155',
          700: '#1E293B',
          800: '#162032',
          900: '#0F172A',
          950: '#0A1120',
        },

        // Gray — mirrors slate so gray-* classes match (used in badges, tables)
        gray: {
          50:  '#EEF2F7',
          100: '#E6ECF3',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#475569',
          600: '#334155',
          700: '#1E293B',
          800: '#0F172A',
          900: '#0A1120',
        },

        // Green → Emerald tones — auto-fixes bg-green-*, text-green-* everywhere
        // (paid badges, success states, boolean "Yes" chips, confirm buttons)
        green: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },

        // Red → Rose tones — auto-fixes bg-red-*, text-red-* everywhere
        // (overdue badges, validation errors, danger buttons, error banners)
        red: {
          50:  '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
        },

        // Amber — branded warm tone for partial/warning states
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

        // Emerald — explicit alias for paid/success (=green override above)
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

        // Rose — explicit alias for overdue/danger (=red override above)
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

        // Blue scale — replaces all blue-* usage (sidebar active, badges, links)
        blue: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          800: '#1E3A8A',
          900: '#1E3A8A',
        },

        // ─────────────────────────────────────────────────────────────────────
        // SEMANTIC DESIGN TOKENS
        // Use these for new code; slate/blue aliases handle the rest.
        // ─────────────────────────────────────────────────────────────────────

        // Primary brand — same as blue override above
        primary: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          800: '#1E3A8A',
        },

        // Teal accent
        teal: {
          50:  '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          400: '#2DD4BF',
          500: '#0D9488',
          600: '#0F766E',
          700: '#115E59',
        },

        // Semantic one-shot tokens (bg-background, bg-surface, border-border, etc.)
        background:    '#E6ECF3',
        surface:       '#FFFFFF',
        border:        '#CBD5E1',
        textPrimary:   '#0F172A',
        textSecondary: '#475569',
        accent:        '#0D9488',
      },

      boxShadow: {
        card:      '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-md': '0 4px 12px 0 rgb(0 0 0 / 0.09), 0 1px 3px -1px rgb(0 0 0 / 0.07)',
        'card-lg': '0 8px 24px 0 rgb(0 0 0 / 0.11), 0 2px 6px -2px rgb(0 0 0 / 0.07)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
