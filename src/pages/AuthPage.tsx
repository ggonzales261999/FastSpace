import { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordValid = password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      if (!fullName.trim()) { setError('Full name is required'); setLoading(false); return; }
      const { error } = await signUp(email, password, fullName, 'user');
      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          setError('This email is already registered. Please sign in instead.');
        } else if (error.message.includes('unexpected_failure') || error.message.includes('Database error')) {
          setError('Sign up failed. Please try again or use a different email.');
        } else {
          setError(error.message);
        }
      }
    }
    setLoading(false);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFC] px-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Inter:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes traceCheck {
          to { stroke-dashoffset: 0; }
        }
        .animate-fade-up { animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mark-path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: traceCheck 0.9s 0.3s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }

        .field-input {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .field-input:focus {
          box-shadow: 0 0 0 3px rgba(99, 102, 168, 0.10);
        }

        .tab-underline {
          transition: transform 0.25s cubic-bezier(0.65, 0, 0.35, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-up, .mark-path { animation: none; stroke-dashoffset: 0; opacity: 1; }
        }
      `}</style>

      <div className="w-full max-w-[380px] font-body">
        {/* Mark + heading */}
        <div className="flex flex-col items-center text-center mb-10 animate-fade-up">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-5">
            <circle cx="18" cy="18" r="17" stroke="#C7C9DA" strokeWidth="1" />
            <path
              className="mark-path"
              d="M11 18.5L15.5 23L25 12.5"
              stroke="#6366A8"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <h1 className="font-display text-[20px] font-normal text-[#1C1E26] tracking-tight">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-[#8B8DA0] text-[13.5px] mt-2 leading-relaxed">
            {mode === 'login' ? 'Sign in to continue to Fast Space.' : 'Set up your workspace in under a minute.'}
          </p>
        </div>

        {/* Quiet tab switcher */}
        <div className="flex gap-6 mb-8 border-b border-[#ECECF1] animate-fade-up" style={{ animationDelay: '60ms' }}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`relative pb-3 text-[13.5px] font-medium transition-colors ${
                mode === m ? 'text-[#1C1E26]' : 'text-[#A6A8B8] hover:text-[#6B6D80]'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
              <span
                className="tab-underline absolute left-0 right-0 -bottom-px h-[1.5px] bg-[#1C1E26] origin-left"
                style={{ transform: mode === m ? 'scaleX(1)' : 'scaleX(0)' }}
              />
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-up" style={{ animationDelay: '120ms' }} noValidate>
          {mode === 'register' && (
            <div>
              <label htmlFor="fullName" className="block text-[13px] text-[#6B6D80] mb-2">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jordan Lee"
                autoComplete="name"
                className="field-input w-full px-0 py-2.5 bg-transparent border-0 border-b border-[#E2E2EA] text-[14px] text-[#1C1E26] placeholder:text-[#C4C5D2] focus:outline-none focus:border-[#6366A8]"
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[13px] text-[#6B6D80] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="field-input w-full px-0 py-2.5 bg-transparent border-0 border-b border-[#E2E2EA] text-[14px] text-[#1C1E26] placeholder:text-[#C4C5D2] focus:outline-none focus:border-[#6366A8]"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[13px] text-[#6B6D80] mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="field-input w-full px-0 py-2.5 pr-8 bg-transparent border-0 border-b border-[#E2E2EA] text-[14px] text-[#1C1E26] placeholder:text-[#C4C5D2] focus:outline-none focus:border-[#6366A8]"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-[#B5B6C4] hover:text-[#6B6D80] transition-colors"
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}
              </button>
            </div>
            {mode === 'register' && (
              <div className={`flex items-center gap-1.5 mt-2.5 text-[12px] transition-colors duration-200 ${passwordValid ? 'text-[#6366A8]' : 'text-[#C4C5D2]'}`}>
                <Check className="w-3 h-3" strokeWidth={2.5} />
                <span>At least 6 characters</span>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-[13px] text-[#B14B4B] animate-fade-up">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 bg-[#1C1E26] hover:bg-[#33354A] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md text-[13.5px] transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366A8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFC]"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {mode === 'login' ? 'Signing in' : 'Creating account'}
              </>
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <p className="text-center text-[#C4C5D2] text-[11.5px] mt-10 animate-fade-up" style={{ animationDelay: '180ms' }}>
          Fast Space
        </p>
      </div>
    </div>
  );
}
