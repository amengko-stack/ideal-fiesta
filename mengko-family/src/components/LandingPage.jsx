import { useNavigate } from 'react-router-dom';
import WorldMap from './WorldMap';

const FEATURES = [
  {
    icon: '🗺️',
    title: 'Family Map',
    desc: 'See where every Mengko family member lives — from Jakarta to Amsterdam, all on one interactive world map.',
  },
  {
    icon: '📋',
    title: 'Family Registry',
    desc: 'Document your family history: parents, children, spouse, and generation. Build the complete Mengko tree.',
  },
  {
    icon: '🔐',
    title: 'Verified Members',
    desc: 'Email-verified submissions reviewed by our admin ensure only real Mengko family members are on the map.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 overflow-x-hidden">

      {/* ── Decorative blobs ── */}
      <div className="fixed -top-32 -left-32 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl blob pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-violet-200/40 rounded-full blur-3xl blob pointer-events-none" style={{ animationDelay: '4s' }} />

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 glass border-b border-sky-100/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl sparkle">✦</span>
            <span className="font-display text-xl font-bold bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
              Mengko Family
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="text-sm text-slate-500 hover:text-sky-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-sky-50"
            >
              Admin
            </button>
            <button
              onClick={() => navigate('/verify')}
              className="text-sm font-semibold bg-gradient-to-r from-sky-400 to-blue-500 text-white px-5 py-2 rounded-full hover:shadow-lg hover:shadow-sky-200 transition-all duration-200 active:scale-95"
            >
              Join Family ✦
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center relative">
        <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-sky-200">
          <span className="sparkle text-sm">✦</span>
          Connecting generations across the globe
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-black mb-6 leading-tight">
          <span className="text-slate-800">Welcome to</span>
          <br />
          <span className="shimmer-text">Mengko Family</span>
        </h1>

        <p className="text-lg text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
          One family. Many cities. The official registry for the Mengko family tree —
          wherever you are in the world, you belong here. 🌏
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => navigate('/verify')}
            className="group flex items-center gap-2 bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold px-8 py-4 rounded-full text-lg hover:shadow-2xl hover:shadow-sky-300/50 transition-all duration-300 active:scale-95"
          >
            <span>Join the Family</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
          <a
            href="#map"
            className="flex items-center gap-2 text-slate-600 font-medium px-6 py-4 rounded-full border border-slate-200 hover:border-sky-300 hover:text-sky-600 transition-all duration-200"
          >
            <span>🗺️</span>
            <span>See the Map</span>
          </a>
        </div>

        {/* Floating decorations */}
        <div className="absolute top-16 left-8 text-3xl float opacity-60 pointer-events-none" style={{ animationDelay: '0.5s' }}>✦</div>
        <div className="absolute top-24 right-12 text-2xl float opacity-40 pointer-events-none" style={{ animationDelay: '1.5s' }}>⋆</div>
        <div className="absolute bottom-8 left-1/4 text-xl float opacity-30 pointer-events-none" style={{ animationDelay: '1s' }}>✧</div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display text-3xl font-bold text-center text-slate-700 mb-3">
          Everything in one place ✨
        </h2>
        <p className="text-center text-slate-400 mb-12">Built for the Mengko family, by the Mengko family.</p>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass rounded-3xl p-7 hover:shadow-xl hover:shadow-sky-100 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 float inline-block" style={{ animationDelay: Math.random() + 's' }}>
                {f.icon}
              </div>
              <h3 className="font-display text-xl font-bold text-slate-700 mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display text-3xl font-bold text-center text-slate-700 mb-12">
          How it works
        </h2>
        <div className="flex flex-col md:flex-row items-start justify-center gap-0 md:gap-4">
          {[
            { step: '01', title: 'Verify Email',   desc: 'Enter your email to receive a magic link — no password needed.',       icon: '✉️' },
            { step: '02', title: 'Fill Your Info', desc: 'Tell us about yourself, your parents, and your family connections.',   icon: '📝' },
            { step: '03', title: 'Get Approved',   desc: 'Admin reviews your submission and approves it within a few days.',     icon: '✅' },
            { step: '04', title: 'On the Map!',    desc: 'Your city appears on the family world map for everyone to see.',       icon: '🗺️' },
          ].map((s, i) => (
            <div key={s.step} className="flex-1 relative flex flex-col items-center text-center px-4">
              {i < 3 && (
                <div className="hidden md:block absolute top-7 left-1/2 w-full h-0.5 bg-gradient-to-r from-sky-200 to-sky-100" />
              )}
              <div className="relative z-10 w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-sky-200 mb-3">
                {s.step}
              </div>
              <div className="text-2xl mb-2">{s.icon}</div>
              <h4 className="font-display font-bold text-slate-700 mb-1">{s.title}</h4>
              <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── World Map ── */}
      <section id="map" className="bg-slate-950 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-center text-white mb-2">
            Family Around the World 🌍
          </h2>
          <p className="text-center text-slate-400 mb-8 text-sm">
            Approved family members shown by city · Click a marker to see details
          </p>
          <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
            <WorldMap />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="glass rounded-3xl p-12 border border-sky-200/60 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-200/30 rounded-full blur-2xl blob" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-sky-200/30 rounded-full blur-2xl blob" style={{ animationDelay: '3s' }} />
          <div className="relative z-10">
            <div className="text-5xl mb-4 float inline-block">🌳</div>
            <h2 className="font-display text-4xl font-black text-slate-800 mb-4">
              Are you a Mengko?
            </h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Join hundreds of family members who have already registered.
              It only takes a few minutes.
            </p>
            <button
              onClick={() => navigate('/verify')}
              className="bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold px-10 py-4 rounded-full text-lg hover:shadow-2xl hover:shadow-sky-300/50 transition-all duration-300 active:scale-95"
            >
              Register Now ✦
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-sky-100 py-8 px-6 text-center text-sm text-slate-400">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="sparkle">✦</span>
          <span className="font-display font-bold text-slate-600">Mengko Family</span>
          <span className="sparkle">✦</span>
        </div>
        <p>Made with 💙 for the Mengko family · Questions? <a href="mailto:allova@mengko.com" className="text-sky-500 hover:underline">allova@mengko.com</a></p>
      </footer>
    </div>
  );
}
