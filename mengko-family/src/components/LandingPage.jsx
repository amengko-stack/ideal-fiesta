import { useNavigate } from 'react-router-dom';
import WorldMap from './WorldMap';

const FEATURES = [
  {
    numeral: 'I',
    title: 'The Family Registry',
    desc: 'A living record of every Mengko — parents, children, spouses, and the generations that connect them.',
  },
  {
    numeral: 'II',
    title: 'The World Map',
    desc: 'From Jakarta to Amsterdam, see exactly where the family has settled across the globe.',
  },
  {
    numeral: 'III',
    title: 'Verified Membership',
    desc: 'Every entry is confirmed by email and reviewed by the family administrator before it joins the record.',
  },
];

const STEPS = [
  { n: '01', title: 'Verify', desc: 'Enter your email and receive a private confirmation link.' },
  { n: '02', title: 'Register', desc: 'Record your name, city, parents, and place in the family line.' },
  { n: '03', title: 'Review', desc: 'The family administrator reviews your submission for approval.' },
  { n: '04', title: 'Belong', desc: 'Your city takes its place on the Mengko family map.' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: 'var(--navy-950)', color: 'var(--ivory)' }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b" style={{ background: 'rgba(7,11,20,0.85)', backdropFilter: 'blur(10px)', borderColor: 'var(--navy-700)' }}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-display text-xl tracking-[0.15em]" style={{ color: 'var(--ivory)' }}>
            MENGKO
          </span>
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/admin')}
              className="text-xs tracking-widest uppercase transition-colors hover:opacity-100"
              style={{ color: 'var(--parchment)', opacity: 0.6 }}
            >
              Admin
            </button>
            <button
              onClick={() => navigate('/verify')}
              className="text-xs font-semibold tracking-widest uppercase px-6 py-3 border transition-all duration-300 hover:bg-[var(--burgundy-600)]"
              style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
            >
              Join the Family
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="grain-overlay relative overflow-hidden" style={{ background: 'linear-gradient(180deg, var(--navy-950), var(--navy-900))' }}>
        <div className="max-w-4xl mx-auto px-6 pt-28 pb-24 text-center relative z-10 fade-up">
          <p className="text-xs tracking-[0.35em] uppercase mb-8" style={{ color: 'var(--gold)' }}>
            Est. — A Family Across the World
          </p>

          <h1 className="font-display text-6xl md:text-8xl font-bold leading-none mb-6" style={{ color: 'var(--ivory)' }}>
            The <span className="gold-shimmer italic">Mengko</span>
            <br />
            Family
          </h1>

          <div className="crest-divider my-8" />

          <p className="text-base md:text-lg max-w-xl mx-auto leading-relaxed mb-12" style={{ color: 'var(--parchment)', opacity: 0.85 }}>
            One name, carried across generations and continents.
            This is the record of where we come from, and where we now call home.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <button
              onClick={() => navigate('/verify')}
              className="px-10 py-4 text-sm font-semibold tracking-widest uppercase transition-all duration-300"
              style={{ background: 'var(--burgundy-700)', color: 'var(--ivory)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--burgundy-600)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--burgundy-700)'}
            >
              Join the Family
            </button>
            <a
              href="#map"
              className="px-10 py-4 text-sm tracking-widest uppercase border transition-colors duration-300"
              style={{ borderColor: 'var(--navy-600)', color: 'var(--parchment)' }}
            >
              View the Map
            </a>
          </div>
        </div>

        {/* Decorative corner flourishes */}
        <div className="absolute top-10 left-10 w-16 h-16 border-t border-l opacity-30 hidden md:block" style={{ borderColor: 'var(--gold)' }} />
        <div className="absolute bottom-10 right-10 w-16 h-16 border-b border-r opacity-30 hidden md:block" style={{ borderColor: 'var(--gold)' }} />
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.35em] uppercase mb-3" style={{ color: 'var(--gold)' }}>What This Is</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold" style={{ color: 'var(--ivory)' }}>
            A Record, Kept Together
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-px" style={{ background: 'var(--navy-700)' }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-10 transition-colors duration-300"
              style={{ background: 'var(--navy-900)' }}
            >
              <p className="font-display text-4xl mb-6" style={{ color: 'var(--burgundy-400)' }}>{f.numeral}</p>
              <h3 className="font-display text-xl font-semibold mb-3" style={{ color: 'var(--ivory)' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--parchment)', opacity: 0.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-6" style={{ background: 'var(--navy-900)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs tracking-[0.35em] uppercase mb-3" style={{ color: 'var(--gold)' }}>The Process</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold" style={{ color: 'var(--ivory)' }}>
              How to Join the Record
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <p className="font-display text-5xl mb-4" style={{ color: 'var(--navy-600)' }}>{s.n}</p>
                <h4 className="font-display text-lg font-semibold mb-2" style={{ color: 'var(--ivory)' }}>{s.title}</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--parchment)', opacity: 0.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── World Map ── */}
      <section id="map" className="py-24 px-6" style={{ background: 'var(--navy-950)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.35em] uppercase mb-3" style={{ color: 'var(--gold)' }}>Where We Are</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-3" style={{ color: 'var(--ivory)' }}>
              The Family, Around the World
            </h2>
            <p className="text-sm" style={{ color: 'var(--parchment)', opacity: 0.6 }}>
              Approved members shown by city — select a marker for details
            </p>
          </div>
          <div className="border" style={{ borderColor: 'var(--navy-700)' }}>
            <WorldMap />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 text-center grain-overlay relative" style={{ background: 'linear-gradient(135deg, var(--burgundy-900), var(--navy-950))' }}>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="crest-divider mb-8" />
          <h2 className="font-display text-3xl md:text-5xl font-semibold mb-6" style={{ color: 'var(--ivory)' }}>
            Are You a Mengko?
          </h2>
          <p className="mb-10 text-sm md:text-base" style={{ color: 'var(--parchment)', opacity: 0.8 }}>
            Add your name to the family record. It takes only a few minutes,
            and connects you to generations past and present.
          </p>
          <button
            onClick={() => navigate('/verify')}
            className="px-12 py-4 text-sm font-semibold tracking-widest uppercase transition-all duration-300"
            style={{ background: 'var(--gold)', color: 'var(--navy-950)' }}
          >
            Register Now
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 text-center border-t" style={{ borderColor: 'var(--navy-700)', background: 'var(--navy-950)' }}>
        <p className="font-display text-sm tracking-[0.2em] mb-2" style={{ color: 'var(--parchment)', opacity: 0.5 }}>
          MENGKO FAMILY
        </p>
        <p className="text-xs" style={{ color: 'var(--parchment)', opacity: 0.4 }}>
          Questions? <a href="mailto:allova@mengko.com" className="hover:opacity-100" style={{ color: 'var(--gold)', opacity: 0.9 }}>allova@mengko.com</a>
        </p>
      </footer>
    </div>
  );
}
