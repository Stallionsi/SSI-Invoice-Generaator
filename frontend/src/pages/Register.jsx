import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt } from 'lucide-react';
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

export default function Register() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary-600 text-white rounded-2xl p-3 mb-3">
            <Receipt className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">InvoiceApp</h1>
          <p className="text-sm text-gray-500 mt-1">Create your account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit((d) => { setApiError(''); mutate(d); })} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                {...register('name')}
                type="text"
                placeholder="John Doe"
                className="input"
                autoComplete="name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

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
              <label className="label">Password</label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="input"
                autoComplete="new-password"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="label">Company Name</label>
              <input
                {...register('companyName')}
                type="text"
                placeholder="Acme Pvt. Ltd."
                className="input"
                autoComplete="organization"
              />
              {errors.companyName && (
                <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>
              )}
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{apiError}</p>
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={isPending}>
              {isPending ? <Spinner /> : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
