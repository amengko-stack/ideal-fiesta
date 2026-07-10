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
    <div className="min-h-screen grain-overlay flex items-center justify-center px-6" style={{ background: 'var(--navy-950)' }}>
      <div className="relative z-10 w-full max-w-md">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-widest uppercase mb-8 transition-opacity hover:opacity-100"
          style={{ color: 'var(--parchment)', opacity: 0.6 }}
        >
          ← Back to Home
        </button>

        <div className="p-10 border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>

          {/* Completing sign-in spinner */}
          {step === 'completing' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-5" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
              <p className="text-sm tracking-wide" style={{ color: 'var(--parchment)' }}>Verifying your email…</p>
            </div>
          )}

          {/* Input step */}
          {step === 'input' && (
            <>
              <div className="text-center mb-10">
                <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ color: 'var(--gold)' }}>
                  Membership Verification
                </p>
                <h1 className="font-display text-3xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
                  Join the Mengko Family
                </h1>
                <div className="crest-divider mb-4" />
                <p className="text-sm leading-relaxed" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
                  Enter your email and we will send you a private confirmation link.
                  No password is required.
                </p>
              </div>

              <form onSubmit={handleSend} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 border focus:outline-none transition-colors"
                    style={{
                      background: 'var(--navy-800)',
                      borderColor: 'var(--navy-600)',
                      color: 'var(--ivory)',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 text-sm border" style={{ background: 'rgba(107,31,46,0.15)', borderColor: 'var(--burgundy-600)', color: 'var(--burgundy-400)' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-4 text-sm font-semibold tracking-widest uppercase transition-colors duration-300"
                  style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--burgundy-600)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--burgundy-700)'}
                >
                  Send Confirmation Link
                </button>
              </form>
            </>
          )}

          {/* Sent confirmation */}
          {step === 'sent' && (
            <div className="text-center py-4">
              <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ color: 'var(--gold)' }}>
                Link Sent
              </p>
              <h2 className="font-display text-3xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
                Check Your Inbox
              </h2>
              <div className="crest-divider mb-5" />
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--parchment)', opacity: 0.75 }}>
                We sent a confirmation link to{' '}
                <strong style={{ color: 'var(--gold)' }}>{email}</strong>.
                Open that email and click the link to continue your registration.
              </p>
              <p className="text-xs mb-8" style={{ color: 'var(--parchment)', opacity: 0.5 }}>
                Didn't receive it? Check your spam folder, or{' '}
                <button
                  onClick={() => setStep('input')}
                  className="underline hover:opacity-100"
                  style={{ color: 'var(--gold)' }}
                >
                  try again
                </button>.
              </p>
              <div className="text-left px-5 py-4" style={{ background: 'var(--navy-800)', borderLeft: '2px solid var(--gold)' }}>
                <p className="text-xs font-medium tracking-widest uppercase mb-1.5" style={{ color: 'var(--gold)' }}>What Happens Next</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
                  After confirming, you will be asked for your family details.
                  Your submission is then reviewed by the family administrator.
                </p>
              </div>
            </div>
          )}

          {/* Error fallback */}
          {step === 'error' && (
            <div className="text-center py-4">
              <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
                Something Went Wrong
              </h2>
              <div className="px-4 py-3 text-sm border mb-6" style={{ background: 'rgba(107,31,46,0.15)', borderColor: 'var(--burgundy-600)', color: 'var(--burgundy-400)' }}>
                {error}
              </div>
              <button
                onClick={() => { setStep('input'); setError(''); }}
                className="text-xs tracking-widest uppercase underline"
                style={{ color: 'var(--gold)' }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
