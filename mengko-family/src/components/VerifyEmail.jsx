import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { auth } from '../firebase';

const STORAGE_KEY = 'mengkoEmailForSignIn';

export default function VerifyEmail({ user }) {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [step, setStep]       = useState('input'); // input | sent | completing | done | error
  const [error, setError]     = useState('');

  // If already logged in, go straight to form
  useEffect(() => {
    if (user) navigate('/join', { replace: true });
  }, [user, navigate]);

  // Handle email link callback (user landed here from the magic link)
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    setStep('completing');
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const emailToUse = saved || window.prompt('Please confirm your email address:');
    if (!emailToUse) { setStep('input'); return; }

    signInWithEmailLink(auth, emailToUse, window.location.href)
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.history.replaceState({}, '', '/join');
        navigate('/join', { replace: true });
      })
      .catch((err) => {
        setError(err.message);
        setStep('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    const actionCodeSettings = {
      url: `${window.location.origin}/join`,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem(STORAGE_KEY, email);
      setStep('sent');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center px-6">

      {/* Blobs */}
      <div className="fixed -top-32 -left-32 w-80 h-80 bg-sky-200/40 rounded-full blur-3xl blob pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-80 h-80 bg-violet-200/40 rounded-full blur-3xl blob pointer-events-none" style={{ animationDelay: '4s' }} />

      <div className="relative z-10 w-full max-w-md">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-slate-400 hover:text-sky-600 text-sm mb-8 transition-colors"
        >
          ← Back to home
        </button>

        <div className="glass rounded-3xl p-8 shadow-xl border border-sky-100">

          {/* Completing sign-in spinner */}
          {step === 'completing' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-3 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Verifying your email…</p>
            </div>
          )}

          {/* Input step */}
          {step === 'input' && (
            <>
              <div className="text-center mb-8">
                <div className="text-5xl mb-3 float inline-block">✉️</div>
                <h1 className="font-display text-2xl font-black text-slate-800 mb-2">
                  Join the Mengko Family
                </h1>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Enter your email and we'll send you a magic link — no password needed.
                </p>
              </div>

              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-white/80 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition-all"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold py-3.5 rounded-2xl hover:shadow-lg hover:shadow-sky-200 transition-all duration-200 active:scale-95"
                >
                  Send Magic Link ✦
                </button>
              </form>
            </>
          )}

          {/* Sent confirmation */}
          {step === 'sent' && (
            <div className="text-center py-4">
              <div className="text-6xl mb-4 float inline-block">📬</div>
              <h2 className="font-display text-2xl font-black text-slate-800 mb-3">
                Check your inbox!
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                We sent a magic link to <strong className="text-sky-600">{email}</strong>.
                Click the link in that email to continue filling the family form.
              </p>
              <p className="text-xs text-slate-400 mb-6">
                Didn't get it? Check spam, or{' '}
                <button
                  onClick={() => setStep('input')}
                  className="text-sky-500 hover:underline"
                >
                  try again
                </button>.
              </p>
              <div className="bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100 text-left">
                <p className="text-xs text-sky-700 font-medium mb-1">✦ What happens next?</p>
                <p className="text-xs text-slate-500">
                  After clicking the link, you'll be taken back here to fill in your family details.
                  Your submission will be reviewed by our admin.
                </p>
              </div>
            </div>
          )}

          {/* Error fallback */}
          {step === 'error' && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="font-display text-xl font-black text-slate-800 mb-3">
                Something went wrong
              </h2>
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm mb-6">
                {error}
              </div>
              <button
                onClick={() => { setStep('input'); setError(''); }}
                className="text-sky-500 hover:underline text-sm"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
