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
const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
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

  /* ── Loading auth state ── */
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ── Not signed in ── */
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center px-6">
        <div className="fixed -top-32 -left-32 w-80 h-80 bg-sky-200/40 rounded-full blur-3xl blob pointer-events-none" />
        <div className="glass rounded-3xl p-10 max-w-sm w-full text-center shadow-xl border border-sky-100 relative z-10">
          <div className="text-5xl mb-4 float inline-block">🔐</div>
          <h1 className="font-display text-2xl font-black text-slate-800 mb-2">Admin Login</h1>
          <p className="text-slate-500 text-sm mb-6">
            Sign in with your <strong className="text-sky-600">@mengko.com</strong> Google account
            to access the dashboard.
          </p>
          <button
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            className="w-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold py-3.5 rounded-2xl hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-sm text-slate-400 hover:text-sky-600 transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  /* ── Wrong account ── */
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex items-center justify-center px-6">
        <div className="glass rounded-3xl p-10 max-w-sm w-full text-center shadow-xl border border-sky-100">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="font-display text-xl font-black text-slate-800 mb-3">Access Denied</h2>
          <p className="text-slate-500 text-sm mb-6">
            <strong className="text-red-500">{user.email}</strong> is not authorised.
            Admin access is restricted to <strong>allova@mengko.com</strong>.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="text-sky-500 hover:underline text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  /* ── Admin dashboard ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-white">
      {/* Header */}
      <header className="glass border-b border-sky-100/60 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-slate-400 hover:text-sky-600 transition-colors text-sm">← Home</button>
            <span className="text-slate-200">|</span>
            <span className="font-display font-bold text-slate-700">✦ Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">{user.email}</span>
            <button
              onClick={() => signOut(auth)}
              className="text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg border border-transparent hover:border-red-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className="glass rounded-2xl p-5 text-center border border-sky-100">
              <p className="text-3xl font-display font-black text-slate-700">{count}</p>
              <p className="text-sm text-slate-500 capitalize mt-1">{status}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
            {Object.entries(TAB_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  tab === key
                    ? 'bg-white shadow text-sky-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
                {counts[key] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    key === 'pending' ? 'bg-amber-100 text-amber-700' :
                    key === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-red-100 text-red-700'
                  }`}>{counts[key]}</span>
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
              className="flex-1 sm:w-64 px-4 py-2 rounded-xl border border-sky-200 bg-white/80 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
            />
            {tab === 'approved' && (
              <button
                onClick={() => exportCSV(filtered)}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
              >
                Export CSV
              </button>
            )}
            <button
              onClick={fetchMembers}
              className="p-2 rounded-xl border border-sky-200 text-sky-600 hover:bg-sky-50 transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">🗂️</div>
            <p className="font-medium">No {tab} submissions{search ? ' matching your search' : ''}.</p>
          </div>
        )}

        {/* Member cards */}
        {!loading && filtered.map((m) => (
          <div
            key={m.id}
            className="glass rounded-2xl border border-sky-100 mb-3 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Card header */}
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer"
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {(m.fullName || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-700 truncate">{m.fullName || '—'}</p>
                  <p className="text-xs text-slate-400 truncate">{m.email} · {m.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[m.status]}`}>
                  {m.status}
                </span>
                {m.submittedAt?.toDate && (
                  <span className="text-xs text-slate-400 hidden sm:block">
                    {m.submittedAt.toDate().toLocaleDateString()}
                  </span>
                )}
                <span className="text-slate-400 text-sm ml-1">
                  {expanded === m.id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Expanded details */}
            {expanded === m.id && (
              <div className="border-t border-sky-100 px-5 pb-5">
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-4">
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
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
                        <p className="text-sm text-slate-700 mt-0.5">{val}</p>
                      </div>
                    ) : null
                  ))}
                  {m.notes && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</span>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{m.notes}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-5">
                  {m.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'approved')}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => setStatus(m.id, 'rejected')}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        ✕ Reject
                      </button>
                    </>
                  )}
                  {m.status === 'approved' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'rejected')}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        ✕ Reject
                      </button>
                      <button
                        onClick={() => deleteMember(m.id)}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                      >
                        🗑 Delete
                      </button>
                    </>
                  )}
                  {m.status === 'rejected' && (
                    <>
                      <button
                        onClick={() => setStatus(m.id, 'approved')}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => deleteMember(m.id)}
                        disabled={actionId === m.id}
                        className="px-5 py-2 bg-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                      >
                        🗑 Delete
                      </button>
                    </>
                  )}
                  {actionId === m.id && (
                    <div className="flex items-center gap-1 text-slate-400 text-sm">
                      <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
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
