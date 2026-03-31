import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap } from 'lucide-react';
import { login } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';
import Spinner from '../components/ui/Spinner';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

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
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #071525 0%, #0B1E35 40%, #102848 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, #F97316, #E05A00)', boxShadow: '0 4px 20px rgba(249,115,22,0.45)' }}>
            <Zap className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">InvoiceApp</h1>
          <p className="text-sm mt-1" style={{ color: '#4A80C4' }}>Sign in to your account</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(7,21,37,0.35)' }}>
          <form onSubmit={handleSubmit((d) => { setApiError(''); mutate(d); })} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="input"
                autoComplete="email"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary-600 hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="input"
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{apiError}</p>
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={isPending}>
              {isPending ? <Spinner /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: '#4A80C4' }}>
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold hover:underline" style={{ color: '#6BA3FF' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
