import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import api from '../api/axios';

export default function VerifyEmail() {
  const [searchParams]        = useSearchParams();
  const [status, setStatus]   = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Please use the link from your email.');
      return;
    }

    api.get(`/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.');
      });
  }, [searchParams]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 40% 80%, #1E1B4B 0%, #0D0B1F 50%, #000000 100%)' }}
    >
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div
          className="rounded-3xl p-10"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          }}
        >
          {status === 'verifying' && (
            <>
              <div className="flex justify-center mb-5">
                <Loader className="w-12 h-12 animate-spin" style={{ color: '#6366f1' }} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Verifying your email…</h2>
              <p className="text-sm" style={{ color: '#9ca3af' }}>Please wait a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center mb-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
                >
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Email verified!</h2>
              <p className="text-sm mb-8" style={{ color: '#9ca3af' }}>
                Your account is now active. You can sign in with your credentials.
              </p>
              <Link
                to="/login"
                className="inline-block w-full py-3 rounded-xl text-sm font-bold text-white text-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)' }}
              >
                Sign In →
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex justify-center mb-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}
                >
                  <XCircle className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Verification failed</h2>
              <p className="text-sm mb-8" style={{ color: '#9ca3af' }}>{message}</p>
              <Link
                to="/register"
                className="inline-block w-full py-3 rounded-xl text-sm font-bold text-white text-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)' }}
              >
                Register again →
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
