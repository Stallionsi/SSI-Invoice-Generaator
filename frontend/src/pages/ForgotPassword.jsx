import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Receipt, ArrowLeft, Mail } from 'lucide-react';
import { forgotPassword } from '../api/auth.api';
import Spinner from '../components/ui/Spinner';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: ({ email }) => forgotPassword(email),
    onSuccess: (_, variables) => {
      setSubmittedEmail(variables.email);
      setSent(true);
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
          <p className="text-sm text-gray-500 mt-1">Reset your password</p>
        </div>

        <div className="card">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 rounded-full p-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Check your email</h2>
                <p className="text-sm text-gray-500 mt-2">
                  We've sent a password reset link to{' '}
                  <span className="font-medium text-gray-700">{submittedEmail}</span>.
                  The link expires in 15 minutes.
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  className="text-primary-600 hover:underline font-medium"
                  onClick={() => setSent(false)}
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit((d) => mutate(d))}
              className="space-y-4"
            >
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your account email and we'll send you a link to reset your password.
                </p>
                <label className="label">Email address</label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  className="input"
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              {isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">
                    {error.response?.data?.message || 'Something went wrong. Please try again.'}
                  </p>
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={isPending}>
                {isPending ? <Spinner /> : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          <Link
            to="/login"
            className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
