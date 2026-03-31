import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { resetPassword } from '../api/auth.api';
import Spinner from '../components/ui/Spinner';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ password }) => resetPassword({ token, password }),
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    },
    onError: (err) => {
      setApiError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card text-center max-w-sm w-full">
          <p className="text-red-600 font-medium">Invalid reset link.</p>
          <Link to="/forgot-password" className="text-primary-600 text-sm hover:underline mt-2 block">
            Request a new one
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary-600 text-white rounded-2xl p-3 mb-3">
            <Receipt className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">InvoiceApp</h1>
          <p className="text-sm text-gray-500 mt-1">Set a new password</p>
        </div>

        <div className="card">
          {done ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 rounded-full p-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Password updated!</h2>
                <p className="text-sm text-gray-500 mt-2">
                  Redirecting you to sign in…
                </p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit((d) => { setApiError(''); mutate(d); })}
              className="space-y-4"
            >
              {/* New password */}
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="input pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Min 8 chars, uppercase, lowercase, and a number.
                </p>
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">Confirm Password</label>
                <div className="relative">
                  <input
                    {...register('confirmPassword')}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="input pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              {apiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{apiError}</p>
                  {apiError.toLowerCase().includes('expired') && (
                    <Link
                      to="/forgot-password"
                      className="text-primary-600 text-xs hover:underline mt-1 block"
                    >
                      Request a new reset link
                    </Link>
                  )}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={isPending}>
                {isPending ? <Spinner /> : 'Set New Password'}
              </button>
            </form>
          )}
        </div>

        {!done && (
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link to="/login" className="text-primary-600 font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
