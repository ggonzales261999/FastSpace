import { useState } from 'react';
import { CheckSquare, Eye, EyeOff, Mail, Lock, User, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
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
    <div className="min-h-screen flex bg-[#FFFCF7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        @keyframes flowDot {
          0% { left: 0%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fadeUp 0.5s ease-out both; }
        .flow-dot { animation: flowDot 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .flow-dot, .animate-fade-up { animation: none; }
        }
      `}</style>

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[46%] bg-[#101935] relative flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F5A623] flex items-center justify-center">
              <CheckSquare className="w-4 h-4 text-[#101935]" />
            </div>
            <span className="font-display text-xl text-white tracking-tight">Fast Space</span>
          </div>
          <p className="text-slate-400 text-sm mt-2 max-w-xs">Project &amp; task management, without the busywork.</p>
        </div>

        {/* Kanban illustration — signature element */}
        <div className="space-y-3">
          {['Plan sprints in minutes', 'Track progress in real time', 'Ship without the chaos'].map(t => (
            <div key={t} className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#2DD4BF] flex-shrink-0" />
              <span className="text-sm text-slate-300">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-fade-up">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#F5A623] flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-[#101935]" />
              </div>
              <span className="font-display text-xl text-[#101935] tracking-tight">Fast Space</span>
            </div>
            <p className="text-slate-500 text-sm">Project &amp; Task Management</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="font-display text-2xl text-[#101935]">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {mode === 'login' ? 'Sign in to get back to your boards.' : 'Set up your workspace in under a minute.'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
            <div className="px-6 pt-6">
              <div className="relative flex bg-slate-100 rounded-full p-1">
                <div
                  className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#101935] transition-transform duration-300 ease-out ${
                    mode === 'register' ? 'translate-x-full' : 'translate-x-0'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  aria-pressed={mode === 'login'}
                  className={`relative z-10 flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors ${
                    mode === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  aria-pressed={mode === 'register'}
                  className={`relative z-10 flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors ${
                    mode === 'register' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Create Account
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="John Doe"
                      autoComplete="name"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#101935]/15 focus:border-[#101935]/40 transition-shadow"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#101935]/15 focus:border-[#101935]/40 transition-shadow"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#101935]/15 focus:border-[#101935]/40 transition-shadow"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'register' && (
                  <div className={`flex items-center gap-1.5 mt-2 text-xs transition-colors ${passwordValid ? 'text-[#0F9B8E]' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${passwordValid ? 'opacity-100' : 'opacity-40'}`} />
                    <span>At least 6 characters</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#F5A623] hover:bg-[#e6981a] disabled:opacity-60 disabled:cursor-not-allowed text-[#101935] font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-slate-400 text-xs mt-6">
            Fast Space — Streamline your team&apos;s workflow
          </p>
        </div>
      </div>
    </div>
  );
}