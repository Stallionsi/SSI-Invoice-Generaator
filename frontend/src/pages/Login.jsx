import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { login, resendVerification } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';
import Spinner from '../components/ui/Spinner';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

/* ── Floating orb ─────────────────────────────────────────────────────────── */
function Orb({ style }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none select-none"
      style={{ filter: 'blur(80px)', opacity: 0.45, ...style }}
    />
  );
}

/* ── Premium input field ──────────────────────────────────────────────────── */
function Field({ label, icon: Icon, error, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <label className="block text-xs font-semibold mb-2" style={{ color: '#A5B4FC' }}>
        {label}
      </label>
      <div className="relative group">
        <Icon
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors duration-200"
          style={{ color: '#6366F1' }}
        />
        {children}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs mt-1.5 flex items-center gap-1"
            style={{ color: '#F87171' }}
          >
            <AlertCircle className="w-3 h-3 shrink-0" /> {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Login() {
  const navigate  = useNavigate();
  const setUser   = useAuthStore((s) => s.setUser);
  const [apiError, setApiError]         = useState('');
  const [showResend, setShowResend]     = useState(false);
  const [resendEmail, setResendEmail]   = useState('');
  const [resendSent, setResendSent]     = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const containerRef = useRef(null);

  /* Subtle parallax on mouse move */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      const { innerWidth: w, innerHeight: h } = window;
      const x = (e.clientX / w - 0.5) * 18;
      const y = (e.clientY / h - 0.5) * 18;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: login,
    onSuccess: (res) => {
      setUser(res.data.data.user);
      toast.success('Welcome back!');
      navigate('/');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Login failed';
      setApiError(msg);
      if (err.response?.status === 403 && msg.toLowerCase().includes('verify')) {
        setShowResend(true);
      }
    },
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse at 60% 20%, #1E1B4B 0%, #0D0B1F 50%, #000000 100%)' }}
    >
      {/* ── Background orbs ─────────────────────────────────────────────── */}
      <Orb style={{ width: 500, height: 500, top: '-10%', left: '-10%', background: '#4F46E5' }} />
      <Orb style={{ width: 400, height: 400, bottom: '-5%', right: '-5%', background: '#7C3AED' }} />
      <Orb style={{ width: 250, height: 250, top: '40%', left: '55%', background: '#2563EB' }} />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <motion.div
        ref={containerRef}
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ transition: 'transform 0.15s ease-out', willChange: 'transform' }}
      >
        {/* Glow behind card */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.25) 0%, transparent 70%)',
            filter: 'blur(20px)',
            transform: 'translateY(-10px) scale(1.05)',
          }}
        />

        {/* Glass card */}
        <div
          className="relative rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Logo */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <motion.div
              className="relative flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                boxShadow: '0 0 0 1px rgba(99,102,241,0.4), 0 8px 32px rgba(99,102,241,0.50)',
              }}
              whileHover={{ scale: 1.07, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {/* Inner glow */}
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)' }}
              />
              <Zap className="w-8 h-8 text-white relative z-10" fill="white" />
            </motion.div>

            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'white' }}>
              InvoiceApp
            </h1>
            <p className="text-sm mt-1.5 font-medium" style={{ color: '#818CF8' }}>
              Sign in to your account
            </p>
          </motion.div>

          {/* Form */}
          <form
            onSubmit={handleSubmit((d) => { setApiError(''); setShowResend(false); setResendSent(false); setResendEmail(d.email); mutate(d); })}
            className="space-y-5"
          >
            <Field label="Email address" icon={Mail} error={errors.email?.message}>
              <input
                {...register('email')}
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'white',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(99,102,241,0.70)';
                  e.target.style.background = 'rgba(99,102,241,0.08)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.04)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.10)';
                  e.target.style.background = 'rgba(255,255,255,0.06)';
                  e.target.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)';
                }}
              />
            </Field>

            <Field label="Password" icon={Lock} error={errors.password?.message}>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'white',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(99,102,241,0.70)';
                  e.target.style.background = 'rgba(99,102,241,0.08)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.04)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.10)';
                  e.target.style.background = 'rgba(255,255,255,0.06)';
                  e.target.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)';
                }}
              />
            </Field>

            <div className="flex justify-end -mt-2">
              <Link
                to="/forgot-password"
                className="text-xs font-semibold transition-colors"
                style={{ color: '#818CF8' }}
                onMouseEnter={(e) => (e.target.style.color = '#A5B4FC')}
                onMouseLeave={(e) => (e.target.style.color = '#818CF8')}
              >
                Forgot password?
              </Link>
            </div>

            {/* API error */}
            <AnimatePresence>
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl px-4 py-3 space-y-2"
                  style={{
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#F87171' }} />
                    <p className="text-sm" style={{ color: '#FCA5A5' }}>{apiError}</p>
                  </div>
                  {showResend && (
                    <div className="pl-6">
                      {resendSent ? (
                        <p className="text-xs font-medium" style={{ color: '#86efac' }}>
                          Verification link sent! Check your inbox.
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={resendLoading}
                          onClick={async () => {
                            setResendLoading(true);
                            try {
                              await resendVerification(resendEmail);
                              setResendSent(true);
                            } catch {
                              // fail silently — backend always returns success
                              setResendSent(true);
                            } finally {
                              setResendLoading(false);
                            }
                          }}
                          className="text-xs font-semibold underline underline-offset-2"
                          style={{ color: '#A5B4FC' }}
                        >
                          {resendLoading ? 'Sending…' : 'Resend verification email →'}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isPending}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)',
                boxShadow: '0 4px 16px rgba(99,102,241,0.40), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
              whileHover={{ scale: 1.015, boxShadow: '0 6px 28px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.20)' }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {/* Shimmer sweep */}
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2.5s infinite',
                }}
              />
              <span className="relative flex items-center justify-center gap-2">
                {isPending ? <Spinner /> : (
                  <>Sign In <ArrowRight className="w-4 h-4" /></>
                )}
              </span>
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <span className="text-xs font-medium" style={{ color: '#4B5563' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>

          <p className="text-center text-sm" style={{ color: '#6B7280' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-semibold transition-colors"
              style={{ color: '#818CF8' }}
              onMouseEnter={(e) => (e.target.style.color = '#A5B4FC')}
              onMouseLeave={(e) => (e.target.style.color = '#818CF8')}
            >
              Create one free →
            </Link>
          </p>
        </div>

        {/* Bottom label */}
        <p className="text-center text-xs mt-5" style={{ color: '#374151' }}>
          Secured by StallionSI · Invoice Manager v1.0
        </p>
      </motion.div>

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        input::placeholder { color: rgba(148,163,184,0.55); }
      `}</style>
    </div>
  );
}
