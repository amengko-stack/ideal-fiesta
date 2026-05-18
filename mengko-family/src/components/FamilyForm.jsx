import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { db, auth } from '../firebase';

const GENERATION_OPTIONS = ['Grandparent', 'Parent', 'Your Generation', 'Children', 'Grandchildren'];
const RELATIONSHIP_OPTIONS = ['Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Cousin', 'Spouse', 'In-law'];

const STORAGE_KEY = 'mengkoEmailForSignIn';

const INITIAL = {
  fullName: '', email: '', city: '', fatherName: '', motherName: '',
  spouseName: '', childrenNames: '', generationLevel: '', relationshipType: '', notes: '',
};

export default function FamilyForm({ user }) {
  const navigate = useNavigate();
  const [form, setForm]       = useState(INITIAL);
  const [status, setStatus]   = useState('idle'); // idle | submitting | success | duplicate | error
  const [error, setError]     = useState('');
  const [authing, setAuthing] = useState(false);

  // Handle email link completion (user landed here from magic link)
  useEffect(() => {
    if (user || authing) return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    setAuthing(true);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const emailToUse = saved || window.prompt('Please confirm your email address:');
    if (!emailToUse) { navigate('/verify'); return; }

    signInWithEmailLink(auth, emailToUse, window.location.href)
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.history.replaceState({}, '', '/join');
      })
      .catch(() => navigate('/verify', { replace: true }))
      .finally(() => setAuthing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill email once user is known
  useEffect(() => {
    if (user?.email) setForm((f) => ({ ...f, email: user.email }));
  }, [user]);

  // Redirect unauthenticated users (after link-check window)
  useEffect(() => {
    if (authing) return;
    if (user === null && !isSignInWithEmailLink(auth, window.location.href)) {
      navigate('/verify', { replace: true });
    }
  }, [user, authing, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return;
    setStatus('submitting');
    setError('');

    try {
      // Rate-limit: one pending/approved submission per email
      const existing = await getDocs(
        query(collection(db, 'family_members'), where('email', '==', user.email))
      );
      if (!existing.empty) {
        setStatus('duplicate');
        return;
      }

      await addDoc(collection(db, 'family_members'), {
        ...form,
        email:       user.email,
        uid:         user.uid,
        status:      'pending',
        submittedAt: serverTimestamp(),
      });

      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function field(id, label, required = false, placeholder = '') {
    return (
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1.5">
          {label} {required && <span className="text-sky-500">*</span>}
        </label>
        <input
          type="text"
          required={required}
          value={form[id]}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-white/80 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
        />
      </div>
    );
  }

  if (authing || user === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center px-6">
        <div className="glass rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-sky-100">
          <div className="text-6xl mb-4 float inline-block">🎉</div>
          <h2 className="font-display text-2xl font-black text-slate-800 mb-3">
            Submission received!
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Thank you, <strong className="text-sky-600">{form.fullName || 'family member'}</strong>!
            Your details are under review by our admin. You'll appear on the family map once approved.
          </p>
          <div className="bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100 text-left mb-6">
            <p className="text-xs text-sky-700 font-medium mb-1">What's next?</p>
            <p className="text-xs text-slate-500">
              Admin will review your submission within a few days.
              For questions, contact{' '}
              <a href="mailto:allova@mengko.com" className="text-sky-500 hover:underline">
                allova@mengko.com
              </a>
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold px-8 py-3 rounded-full hover:shadow-lg transition-all active:scale-95"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center px-6">
        <div className="glass rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-sky-100">
          <div className="text-5xl mb-4">ℹ️</div>
          <h2 className="font-display text-xl font-black text-slate-800 mb-3">
            Already submitted
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            A submission for <strong className="text-sky-600">{user?.email}</strong> already exists.
            If you need to update your info, contact{' '}
            <a href="mailto:allova@mengko.com" className="text-sky-500 hover:underline">allova@mengko.com</a>.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold px-8 py-3 rounded-full hover:shadow-lg transition-all active:scale-95"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 py-12 px-6">
      <div className="fixed -top-32 -left-32 w-80 h-80 bg-sky-200/40 rounded-full blur-3xl blob pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-80 h-80 bg-violet-200/40 rounded-full blur-3xl blob pointer-events-none" style={{ animationDelay: '4s' }} />

      <div className="relative z-10 max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-slate-400 hover:text-sky-600 text-sm mb-6 transition-colors"
        >
          ← Back to home
        </button>

        <div className="glass rounded-3xl p-8 shadow-xl border border-sky-100">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3 float inline-block">🌳</div>
            <h1 className="font-display text-2xl font-black text-slate-800 mb-2">
              Family Member Registration
            </h1>
            <p className="text-slate-500 text-sm">
              Verified as <strong className="text-sky-600">{user?.email}</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid md:grid-cols-2 gap-5">
              {field('fullName', 'Full Name', true, 'e.g. Budi Mengko')}
              {field('city', 'Current City / Domicile', true, 'e.g. Jakarta')}
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Email <span className="text-sky-500">*</span>
              </label>
              <input
                type="email"
                value={form.email || user?.email || ''}
                readOnly
                className="w-full px-4 py-3 rounded-2xl border border-sky-100 bg-sky-50/60 text-slate-400 cursor-not-allowed"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {field('fatherName', "Father's Name", true, "Father's full name")}
              {field('motherName', "Mother's Name", true, "Mother's full name")}
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {field('spouseName', 'Spouse Name', false, 'Leave blank if none')}
              {field('childrenNames', 'Children Names', false, 'Comma-separated')}
            </div>

            {/* Generation */}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Generation Level
              </label>
              <select
                value={form.generationLevel}
                onChange={(e) => setForm((f) => ({ ...f, generationLevel: e.target.value }))}
                className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-white/80 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
              >
                <option value="">— Select generation —</option>
                {GENERATION_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Relationship */}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Relationship Type
              </label>
              <select
                value={form.relationshipType}
                onChange={(e) => setForm((f) => ({ ...f, relationshipType: e.target.value }))}
                className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-white/80 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
              >
                <option value="">— Select relationship —</option>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Additional Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any extra genealogy info, family stories, etc."
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-white/80 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 text-xs text-slate-500">
              ℹ️ Your submission will be reviewed by our admin before appearing on the family map.
              Status will be set to <strong>Pending</strong> until approved.
            </div>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold py-4 rounded-2xl hover:shadow-lg hover:shadow-sky-200 transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'submitting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit Registration ✦'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
