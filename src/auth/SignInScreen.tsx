import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export function SignInScreen() {
  const { signIn, createAccount, continueAsGuest, resetPassword, error, loading, clearError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setWorking(true);
    try {
      if (mode === 'reset') {
        const sent = await resetPassword(email);
        if (sent) setNotice('If an account exists for that email, a password reset link is on its way.');
      } else if (mode === 'signup') {
        await createAccount(email, password, geminiKey);
      } else {
        await signIn(email, password);
      }
    } finally {
      setWorking(false);
    }
  };

  const changeMode = (nextMode: typeof mode) => {
    clearError();
    setNotice('');
    setMode(nextMode);
  };

  const handleGuest = async () => {
    setWorking(true);
    clearError();
    setNotice('');
    try {
      await continueAsGuest();
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl shadow-cyan-950/20">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-2xl font-black text-white">N</div>
        <h1 className="text-center text-2xl font-bold">
          {mode === 'signup' ? 'Create your Nova account' : mode === 'reset' ? 'Reset your password' : 'Sign in to Nova'}
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-zinc-400">
          Sign in with your email to keep your assistant memories private to your account.
        </p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-zinc-300">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-500"
              placeholder="you@example.com"
            />
          </label>
          {mode !== 'reset' && (
            <label className="block text-sm font-medium text-zinc-300">
              Password
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-500"
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              />
            </label>
          )}
          {mode === 'signup' && (
            <label className="block text-sm font-medium text-zinc-300">
              Gemini API key <span className="font-normal text-zinc-500">(optional)</span>
              <div className="mt-2 flex overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 focus-within:border-cyan-500">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={geminiKey}
                  onChange={(event) => setGeminiKey(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-600"
                  placeholder="Paste your Google AI Studio key"
                />
                <button type="button" onClick={() => setShowGeminiKey((visible) => !visible)} className="px-3 text-xs text-cyan-300 hover:text-cyan-200">
                  {showGeminiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">
                Leave blank to use the app’s configured Gemini key. Your key is encrypted before it is saved to your account.
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={loading || working}
            className="flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60"
          >
            {working ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-400">
          {mode === 'signin' ? (
            <>
              <button type="button" onClick={() => changeMode('signup')} className="text-cyan-300 hover:text-cyan-200">Create account</button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => changeMode('reset')} className="text-cyan-300 hover:text-cyan-200">Forgot password?</button>
            </>
          ) : (
            <button type="button" onClick={() => changeMode('signin')} className="text-cyan-300 hover:text-cyan-200">Back to sign in</button>
          )}
        </div>
        {mode === 'signin' && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
              <span className="h-px flex-1 bg-zinc-800" />
              <span>or</span>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
            <button
              type="button"
              onClick={handleGuest}
              disabled={loading || working}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
            >
              {working ? 'Starting guest session…' : 'Continue as guest — no login needed'}
            </button>
          </>
        )}
        {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <p className="mt-5 text-center text-xs text-zinc-500">Your saved memories are associated with your signed-in account.</p>
      </section>
    </main>
  );
}
