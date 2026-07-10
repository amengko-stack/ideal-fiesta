import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { db, auth } from '../firebase';

const GENERATION_OPTIONS = ['Grandparent', 'Parent', 'Your Generation', 'Children', 'Grandchildren'];
const RELATIONSHIP_OPTIONS = ['Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Cousin', 'Spouse', 'In-law'];

const STORAGE_KEY = 'mengkoEmailForSignIn';

const INITIAL = {
  fullName: '', email: '', city: '', fatherName: '', motherName: '',
  spouseName: '', childrenNames: '', generationLevel: '', relationshipType: '', notes: '',
};

const inputStyle = {
  background: 'var(--navy-800)',
  borderColor: 'var(--navy-600)',
  color: 'var(--ivory)',
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
      // Doc ID = uid: security rules only allow `create`, so a second
      // submission is an update and gets rejected — one entry per person.
      await setDoc(doc(db, 'family_members', user.uid), {
        ...form,
        email:       user.email,
        uid:         user.uid,
        status:      'pending',
        submittedAt: serverTimestamp(),
      });

      setStatus('success');
    } catch (err) {
      if (err.code === 'permission-denied') {
        setStatus('duplicate');
        return;
      }
      setError(err.message);
      setStatus('error');
    }
  }

  function field(id, label, required = false, placeholder = '') {
    return (
      <div>
        <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
          {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
        </label>
        <input
          type="text"
          required={required}
          value={form[id]}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-4 py-3 border focus:outline-none transition-colors"
          style={inputStyle}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
        />
      </div>
    );
  }

  if (authing || user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy-950)' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen grain-overlay flex items-center justify-center px-6" style={{ background: 'var(--navy-950)' }}>
        <div className="relative z-10 p-10 max-w-md w-full text-center border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>
          <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ color: 'var(--gold)' }}>
            Registration Complete
          </p>
          <h2 className="font-display text-3xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
            Submission Received
          </h2>
          <div className="crest-divider mb-5" />
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--parchment)', opacity: 0.75 }}>
            Thank you, <strong style={{ color: 'var(--gold)' }}>{form.fullName || 'family member'}</strong>.
            Your details are now under review. Once approved, your city will
            take its place on the family map.
          </p>
          <div className="text-left px-5 py-4 mb-8" style={{ background: 'var(--navy-800)', borderLeft: '2px solid var(--gold)' }}>
            <p className="text-xs font-medium tracking-widest uppercase mb-1.5" style={{ color: 'var(--gold)' }}>What Happens Next</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
              The administrator reviews submissions within a few days.
              Questions? Contact{' '}
              <a href="mailto:allova@mengko.com" className="underline" style={{ color: 'var(--gold)' }}>
                allova@mengko.com
              </a>
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-10 py-3.5 text-sm font-semibold tracking-widest uppercase transition-colors duration-300"
            style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--burgundy-600)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--burgundy-700)'}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div className="min-h-screen grain-overlay flex items-center justify-center px-6" style={{ background: 'var(--navy-950)' }}>
        <div className="relative z-10 p-10 max-w-md w-full text-center border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>
          <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
            Already Registered
          </h2>
          <div className="crest-divider mb-5" />
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--parchment)', opacity: 0.75 }}>
            A submission for <strong style={{ color: 'var(--gold)' }}>{user?.email}</strong> already exists
            in the family record. To update your details, contact{' '}
            <a href="mailto:allova@mengko.com" className="underline" style={{ color: 'var(--gold)' }}>allova@mengko.com</a>.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-10 py-3.5 text-sm font-semibold tracking-widest uppercase transition-colors duration-300"
            style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--burgundy-600)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--burgundy-700)'}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grain-overlay py-14 px-6" style={{ background: 'var(--navy-950)' }}>
      <div className="relative z-10 max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-widest uppercase mb-8 transition-opacity hover:opacity-100"
          style={{ color: 'var(--parchment)', opacity: 0.6 }}
        >
          ← Back to Home
        </button>

        <div className="p-10 border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>
          <div className="text-center mb-10">
            <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ color: 'var(--gold)' }}>
              The Family Record
            </p>
            <h1 className="font-display text-3xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>
              Member Registration
            </h1>
            <div className="crest-divider mb-4" />
            <p className="text-sm" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
              Verified as <strong style={{ color: 'var(--gold)' }}>{user?.email}</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {field('fullName', 'Full Name', true, 'e.g. Budi Mengko')}
              {field('city', 'Current City / Domicile', true, 'e.g. Jakarta')}
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
                Email <span style={{ color: 'var(--gold)' }}>*</span>
              </label>
              <input
                type="email"
                value={form.email || user?.email || ''}
                readOnly
                className="w-full px-4 py-3 border cursor-not-allowed"
                style={{ background: 'rgba(20,29,46,0.5)', borderColor: 'var(--navy-700)', color: 'var(--parchment)', opacity: 0.7 }}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {field('fatherName', "Father's Name", true, "Father's full name")}
              {field('motherName', "Mother's Name", true, "Mother's full name")}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {field('spouseName', 'Spouse Name', false, 'Leave blank if none')}
              {field('childrenNames', 'Children Names', false, 'Comma-separated')}
            </div>

            {/* Generation */}
            <div>
              <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
                Generation Level
              </label>
              <select
                value={form.generationLevel}
                onChange={(e) => setForm((f) => ({ ...f, generationLevel: e.target.value }))}
                className="w-full px-4 py-3 border focus:outline-none transition-colors"
                style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
              >
                <option value="">— Select generation —</option>
                {GENERATION_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Relationship */}
            <div>
              <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
                Relationship Type
              </label>
              <select
                value={form.relationshipType}
                onChange={(e) => setForm((f) => ({ ...f, relationshipType: e.target.value }))}
                className="w-full px-4 py-3 border focus:outline-none transition-colors"
                style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
              >
                <option value="">— Select relationship —</option>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
                Additional Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any extra genealogy information, family stories, etc."
                rows={3}
                className="w-full px-4 py-3 border focus:outline-none transition-colors resize-none"
                style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
              />
            </div>

            {error && (
              <div className="px-4 py-3 text-sm border" style={{ background: 'rgba(107,31,46,0.15)', borderColor: 'var(--burgundy-600)', color: 'var(--burgundy-400)' }}>
                {error}
              </div>
            )}

            <div className="px-5 py-4 text-xs leading-relaxed" style={{ background: 'var(--navy-800)', borderLeft: '2px solid var(--gold)', color: 'var(--parchment)', opacity: 0.8 }}>
              Your submission will be reviewed by the family administrator before
              appearing on the map. Its status remains <strong style={{ color: 'var(--gold)' }}>Pending</strong> until approved.
            </div>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full py-4 text-sm font-semibold tracking-widest uppercase transition-colors duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
              onMouseEnter={(e) => { if (status !== 'submitting') e.currentTarget.style.background = 'var(--burgundy-600)'; }}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--burgundy-700)'}
            >
              {status === 'submitting' ? (
                <>
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--ivory)', borderTopColor: 'transparent' }} />
                  Submitting…
                </>
              ) : (
                'Submit Registration'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
