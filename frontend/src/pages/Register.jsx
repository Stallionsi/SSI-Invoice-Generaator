import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap, User, Mail, Lock, Building2, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { register as registerApi } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';
import Spinner from '../components/ui/Spinner';

const schema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters'),
  email:       z.string().email('Invalid email'),
  password:    z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/\d/,    'Must contain a number'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
});

function Orb({ style }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none select-none"
      style={{ filter: 'blur(80px)', opacity: 0.40, ...style }}
    />
  );
}

function Field({ label, icon: Icon, error, delay = 0, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <label className="block text-xs font-semibold mb-2" style={{ color: '#A5B4FC' }}>
        {label}
      </label>
      <div className="relative">
        <Icon
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
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

const inputStyle = {
  base: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'white',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  focus: {
    border: '1px solid rgba(99,102,241,0.70)',
    background: 'rgba(99,102,241,0.08)',
    boxShadow: '0 0 0 3px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
};

function PremiumInput({ innerRef, focusStyle = inputStyle.focus, ...props }) {
  return (
    <input
      ref={innerRef}
      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
      style={inputStyle.base}
      onFocus={(e) => Object.assign(e.target.style, focusStyle)}
      onBlur={(e) => Object.assign(e.target.style, inputStyle.base)}
      {...props}
    />
  );
}

export default function Register() {
  const navigate = useNavigate();
  const setUser  = useAuthStore((s) => s.setUser);
  const [apiError, setApiError] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      const x = (e.clientX / window.innerWidth  - 0.5) * 14;
      const y = (e.clientY / window.innerHeight - 0.5) * 14;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: registerApi,
    onSuccess: (res) => {
      setUser(res.data.data.user);
      toast.success('Account created! Welcome.');
      navigate('/');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Registration failed';
      setApiError(msg);
    },
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse at 40% 80%, #1E1B4B 0%, #0D0B1F 50%, #000000 100%)' }}
    >
      {/* Orbs */}
      <Orb style={{ width: 500, height: 500, top: '-15%', right: '-10%', background: '#4F46E5' }} />
      <Orb style={{ width: 350, height: 350, bottom: '-10%', left: '-8%', background: '#7C3AED' }} />
      <Orb style={{ width: 200, height: 200, top: '30%', left: '60%', background: '#2563EB' }} />

      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        ref={containerRef}
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ transition: 'transform 0.15s ease-out', willChange: 'transform' }}
      >
        {/* Glow */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.25) 0%, transparent 70%)',
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
            className="flex flex-col items-center mb-7"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <motion.div
              className="relative flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
                boxShadow: '0 0 0 1px rgba(124,58,237,0.4), 0 8px 32px rgba(124,58,237,0.45)',
              }}
              whileHover={{ scale: 1.07, rotate: -5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)' }}
              />
              <Zap className="w-7 h-7 text-white relative z-10" fill="white" />
            </motion.div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Create account</h1>
            <p className="text-sm mt-1 font-medium" style={{ color: '#818CF8' }}>
              Start your free InvoiceApp journey
            </p>
          </motion.div>

          {/* Form */}
          <form
            onSubmit={handleSubmit((d) => { setApiError(''); mutate(d); })}
            className="space-y-4"
          >
            <Field label="Full Name" icon={User} error={errors.name?.message} delay={0.05}>
              <input
                {...register('name')}
                type="text"
                placeholder="John Doe"
                autoComplete="name"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={inputStyle.base}
                onFocus={(e) => Object.assign(e.target.style, inputStyle.focus)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle.base)}
              />
            </Field>

            <Field label="Email address" icon={Mail} error={errors.email?.message} delay={0.10}>
              <input
                {...register('email')}
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={inputStyle.base}
                onFocus={(e) => Object.assign(e.target.style, inputStyle.focus)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle.base)}
              />
            </Field>

            <Field label="Password" icon={Lock} error={errors.password?.message} delay={0.15}>
              <input
                {...register('password')}
                type="password"
                placeholder="Min 8 chars, uppercase + number"
                autoComplete="new-password"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={inputStyle.base}
                onFocus={(e) => Object.assign(e.target.style, inputStyle.focus)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle.base)}
              />
            </Field>

            <Field label="Company Name" icon={Building2} error={errors.companyName?.message} delay={0.20}>
              <input
                {...register('companyName')}
                type="text"
                placeholder="Acme Pvt. Ltd."
                autoComplete="organization"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                style={inputStyle.base}
                onFocus={(e) => Object.assign(e.target.style, inputStyle.focus)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle.base)}
              />
            </Field>

            {/* API error */}
            <AnimatePresence>
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                  style={{
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#F87171' }} />
                  <p className="text-sm" style={{ color: '#FCA5A5' }}>{apiError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isPending}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-white overflow-hidden mt-1"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 50%, #4F46E5 100%)',
                boxShadow: '0 4px 16px rgba(124,58,237,0.40), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
              whileHover={{ scale: 1.015, boxShadow: '0 6px 28px rgba(124,58,237,0.55), inset 0 1px 0 rgba(255,255,255,0.20)' }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
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
                  <>Create Account <ArrowRight className="w-4 h-4" /></>
                )}
              </span>
            </motion.button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <span className="text-xs font-medium" style={{ color: '#4B5563' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>

          <p className="text-center text-sm" style={{ color: '#6B7280' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold transition-colors"
              style={{ color: '#818CF8' }}
              onMouseEnter={(e) => (e.target.style.color = '#A5B4FC')}
              onMouseLeave={(e) => (e.target.style.color = '#818CF8')}
            >
              Sign in →
            </Link>
          </p>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: '#374151' }}>
          Secured by StallionSI · Invoice Manager v1.0
        </p>
      </motion.div>

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
