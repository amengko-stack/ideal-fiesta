import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleAuthProvider, signInWithPopup, signOut,
} from 'firebase/auth';
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

const ADMIN_EMAIL = 'allova@mengko.com';

const TAB_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

// Muted heritage-palette status colors
const STATUS_STYLE = {
  pending:  { color: '#c9a84c', background: 'rgba(201,168,76,0.12)',  borderColor: 'rgba(201,168,76,0.4)' },
  approved: { color: '#6fae85', background: 'rgba(74,122,92,0.15)',   borderColor: 'rgba(111,174,133,0.4)' },
  rejected: { color: '#b34a5c', background: 'rgba(107,31,46,0.2)',    borderColor: 'rgba(179,74,92,0.4)' },
};

function exportCSV(members) {
  const COLS = ['fullName','email','city','fatherName','motherName','spouseName',
                'childrenNames','generationLevel','relationshipType','notes','status','submittedAt'];
  const header = COLS.join(',');
  const rows = members.map((m) =>
    COLS.map((c) => {
      const v = c === 'submittedAt' && m[c]?.toDate
        ? m[c].toDate().toLocaleDateString()
        : (m[c] ?? '');
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mengko-family-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard({ user }) {
  const navigate = useNavigate();
  const [members, setMembers]     = useState([]);
  const [tab, setTab]             = useState('pending');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [actionId, setActionId]   = useState(null);
  const [expanded, setExpanded]   = useState(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchMembers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const q    = query(collection(db, 'family_members'), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function setStatus(id, newStatus) {
    setActionId(id);
    try {
      await updateDoc(doc(db, 'family_members', id), {
        status: newStatus,
        [`${newStatus}At`]: serverTimestamp(),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
      );
    } finally {
      setActionId(null);
    }
  }

  async function deleteMember(id) {
    if (!window.confirm('Delete this member permanently?')) return;
    setActionId(id);
    try {
      await deleteDoc(doc(db, 'family_members', id));
      setMembers((prev) => prev.filter((m) => m.id !== id));
      if (expanded === id) setExpanded(null);
    } finally {
      setActionId(null);
    }
  }

  const filtered = members
    .filter((m) => m.status === tab)
    .filter((m) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (m.fullName || '').toLowerCase().includes(s) ||
        (m.city     || '').toLowerCase().includes(s) ||
        (m.email    || '').toLowerCase().includes(s)
      );
    });

  const counts = {
    pending:  members.filter((m) => m.status === 'pending').length,
    approved: members.filter((m) => m.status === 'approved').length,
    rejected: members.filter((m) => m.status === 'rejected').length,
  };

  const actionBtn = 'px-5 py-2.5 text-xs font-semibold tracking-widest uppercase transition-colors duration-200 disabled:opacity-50';

  /* ── Loading auth state ── */
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy-950)' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  /* ── Not signed in ── */
  if (!user) {
    return (
      <div className="min-h-screen grain-overlay flex items-center justify-center px-6" style={{ background: 'var(--navy-950)' }}>
        <div className="relative z-10 p-10 max-w-sm w-full text-center border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>
          <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ color: 'var(--gold)' }}>
            Restricted Access
          </p>
          <h1 className="font-display text-2xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>Administrator Login</h1>
          <div className="crest-divider mb-5" />
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
            Sign in with the family administrator account to manage the registry.
          </p>
          <button
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            className="w-full py-3.5 text-sm font-medium tracking-wide border transition-colors duration-200 flex items-center justify-center gap-3"
            style={{ background: 'var(--navy-800)', borderColor: 'var(--navy-600)', color: 'var(--ivory)' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-6 text-xs tracking-widest uppercase transition-opacity hover:opacity-100"
            style={{ color: 'var(--parchment)', opacity: 0.5 }}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  /* ── Wrong account ── */
  if (!isAdmin) {
    return (
      <div className="min-h-screen grain-overlay flex items-center justify-center px-6" style={{ background: 'var(--navy-950)' }}>
        <div className="relative z-10 p-10 max-w-sm w-full text-center border" style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}>
          <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: 'var(--ivory)' }}>Access Denied</h2>
          <div className="crest-divider mb-5" />
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--parchment)', opacity: 0.7 }}>
            <strong style={{ color: 'var(--burgundy-400)' }}>{user.email}</strong> is not authorised.
            Administration is restricted to the family administrator account.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="text-xs tracking-widest uppercase underline"
            style={{ color: 'var(--gold)' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  /* ── Admin dashboard ── */
  return (
    <div className="min-h-screen" style={{ background: 'var(--navy-950)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(7,11,20,0.9)', backdropFilter: 'blur(10px)', borderColor: 'var(--navy-700)' }}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-xs tracking-widest uppercase transition-opacity hover:opacity-100"
              style={{ color: 'var(--parchment)', opacity: 0.6 }}
            >
              ← Home
            </button>
            <span style={{ color: 'var(--navy-600)' }}>|</span>
            <span className="font-display text-lg" style={{ color: 'var(--ivory)' }}>Administration</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--parchment)', opacity: 0.5 }}>{user.email}</span>
            <button
              onClick={() => signOut(auth)}
              className="text-xs tracking-widest uppercase transition-colors"
              style={{ color: 'var(--parchment)', opacity: 0.7 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--burgundy-400)'; e.currentTarget.style.opacity = 1; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--parchment)'; e.currentTarget.style.opacity = 0.7; }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px mb-10" style={{ background: 'var(--navy-700)' }}>
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className="p-6 text-center" style={{ background: 'var(--navy-900)' }}>
              <p className="font-display text-4xl font-semibold" style={{ color: 'var(--ivory)' }}>{count}</p>
              <p className="text-xs tracking-widest uppercase mt-2" style={{ color: 'var(--parchment)', opacity: 0.55 }}>{status}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Tabs */}
          <div className="flex" style={{ background: 'var(--navy-800)' }}>
            {Object.entries(TAB_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="px-5 py-2.5 text-xs font-semibold tracking-widest uppercase transition-all"
                style={{
                  color: tab === key ? 'var(--gold)' : 'var(--parchment)',
                  opacity: tab === key ? 1 : 0.55,
                  borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent',
                }}
              >
                {label}
                {counts[key] > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs border" style={STATUS_STYLE[key]}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search name, city, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 sm:w-64 px-4 py-2.5 text-sm border focus:outline-none transition-colors"
              style={{ background: 'var(--navy-800)', borderColor: 'var(--navy-600)', color: 'var(--ivory)' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--navy-600)'}
            />
            {tab === 'approved' && (
              <button
                onClick={() => exportCSV(filtered)}
                className="px-4 py-2.5 text-xs font-semibold tracking-widest uppercase whitespace-nowrap transition-opacity hover:opacity-90"
                style={{ background: 'var(--gold)', color: 'var(--navy-950)' }}
              >
                Export CSV
              </button>
            )}
            <button
              onClick={fetchMembers}
              className="px-3 py-2.5 border transition-colors"
              style={{ borderColor: 'var(--navy-600)', color: 'var(--gold)' }}
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'var(--parchment)', opacity: 0.45 }}>
              No {tab} submissions{search ? ' matching your search' : ''}.
            </p>
          </div>
        )}

        {/* Member cards */}
        {!loading && filtered.map((m) => (
          <div
            key={m.id}
            className="border mb-3 overflow-hidden"
            style={{ background: 'var(--navy-900)', borderColor: 'var(--navy-700)' }}
          >
            {/* Card header */}
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer"
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-display font-semibold text-base flex-shrink-0"
                  style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
                >
                  {(m.fullName || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--ivory)' }}>{m.fullName || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--parchment)', opacity: 0.5 }}>{m.email} · {m.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span className="text-xs font-semibold tracking-widest uppercase px-2.5 py-1 border" style={STATUS_STYLE[m.status]}>
                  {m.status}
                </span>
                {m.submittedAt?.toDate && (
                  <span className="text-xs hidden sm:block" style={{ color: 'var(--parchment)', opacity: 0.4 }}>
                    {m.submittedAt.toDate().toLocaleDateString()}
                  </span>
                )}
                <span className="text-sm" style={{ color: 'var(--parchment)', opacity: 0.5 }}>
                  {expanded === m.id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Expanded details */}
            {expanded === m.id && (
              <div className="border-t px-5 pb-5" style={{ borderColor: 'var(--navy-700)' }}>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-5">
                  {[
                    ['Father', m.fatherName],
                    ['Mother', m.motherName],
                    ['Spouse', m.spouseName],
                    ['Children', m.childrenNames],
                    ['Generation', m.generationLevel],
                    ['Relationship', m.relationshipType],
                  ].map(([label, val]) => (
                    val ? (
                      <div key={label}>
                        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--parchment)', opacity: 0.45 }}>{label}</span>
                        <p className="text-sm mt-1" style={{ color: 'var(--ivory)' }}>{val}</p>
                      </div>
                    ) : null
                  ))}
                  {m.notes && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--parchment)', opacity: 0.45 }}>Notes</span>
                      <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--ivory)' }}>{m.notes}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-6">
                  {m.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'approved')}
                        disabled={actionId === m.id}
                        className={actionBtn}
                        style={{ background: '#4a7a5c', color: 'var(--ivory)' }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setStatus(m.id, 'rejected')}
                        disabled={actionId === m.id}
                        className={actionBtn}
                        style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {m.status === 'approved' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'rejected')}
                        disabled={actionId === m.id}
                        className={actionBtn}
                        style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => deleteMember(m.id)}
                        disabled={actionId === m.id}
                        className={`${actionBtn} border`}
                        style={{ background: 'transparent', borderColor: 'var(--navy-600)', color: 'var(--parchment)' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {m.status === 'rejected' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'approved')}
                        disabled={actionId === m.id}
                        className={actionBtn}
                        style={{ background: '#4a7a5c', color: 'var(--ivory)' }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => deleteMember(m.id)}
                        disabled={actionId === m.id}
                        className={`${actionBtn} border`}
                        style={{ background: 'transparent', borderColor: 'var(--navy-600)', color: 'var(--parchment)' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {actionId === m.id && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--parchment)', opacity: 0.6 }}>
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
                      Saving…
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
