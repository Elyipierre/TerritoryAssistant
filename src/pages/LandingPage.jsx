import { Link } from 'react-router-dom';
import TerritoryBackdrop from '../components/TerritoryBackdrop';

const TOURS = [
  {
    slug: 'blue-ridge',
    name: 'Blue Ridge Mountain Tour',
    tagline: 'Wind through scenic overlooks, hidden waterfalls, and charming mountain communities.',
    duration: '4 hrs',
    groupSize: 'Up to 12',
    price: '$85',
    gradient: 'linear-gradient(135deg, #0a2a27 0%, #14b8a6 100%)',
    highlights: ['Scenic mountain overlooks', 'Hidden waterfall stops', 'Local history & stories', 'Complimentary refreshments'],
  },
  {
    slug: 'historic-downtown',
    name: 'Historic Downtown Walking Tour',
    tagline: 'Discover centuries of architecture, local legends, and the gems that make this town special.',
    duration: '2 hrs',
    groupSize: 'Up to 20',
    price: '$45',
    gradient: 'linear-gradient(135deg, #08183e 0%, #2459af 100%)',
    highlights: ['Historic architecture', 'Local legends & stories', 'Hidden courtyards', 'Photo opportunities'],
  },
  {
    slug: 'sunset-valley',
    name: 'Sunset Valley Scenic Drive',
    tagline: 'Chase the golden hour through Valley Road as the sun dips below the ridgeline.',
    duration: '3 hrs',
    groupSize: 'Up to 8',
    price: '$65',
    gradient: 'linear-gradient(135deg, #291707 0%, #c97d22 100%)',
    highlights: ['Golden hour photography', 'Wildlife spotting', 'Valley overlooks', 'Small group experience'],
  },
];

export default function LandingPage() {
  return (
    <div className="landing-root">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-header-logo">
            <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span>JW Bethel Tours</span>
          </div>
          <nav className="landing-nav">
            <Link to="/tours">Tours</Link>
            <Link to="/book" className="nav-book-btn">Book Now</Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <TerritoryBackdrop />
        <div className="landing-hero-glow" />
        <div className="landing-hero-content">
          <div className="landing-hero-logo">
            <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <p className="landing-eyebrow">GUIDED TOURS · JW BETHEL</p>
          <h1 className="landing-headline">
            Discover the Stories<br />
            <span className="landing-headline-accent">Hidden in Plain Sight</span>
          </h1>
          <p className="landing-hero-desc">
            Mountain landscapes, historic streets, and sunset valleys — guided by locals who know every story worth telling.
          </p>
          <div className="landing-hero-cta">
            <Link to="/book" className="cta-primary">Reserve Your Spot</Link>
            <Link to="/tours" className="cta-ghost">Explore Tours</Link>
          </div>
          <div className="landing-hero-stats">
            <div className="hero-stat"><strong>3</strong><span>Unique Tours</span></div>
            <div className="hero-stat-divider" />
            <div className="hero-stat"><strong>5★</strong><span>Guest Rating</span></div>
            <div className="hero-stat-divider" />
            <div className="hero-stat"><strong>Live</strong><span>Guide Tracking</span></div>
          </div>
        </div>
      </section>

      <section className="landing-tours">
        <div className="landing-section">
          <div className="landing-section-header">
            <p className="section-eyebrow">FEATURED EXPERIENCES</p>
            <h2>Tours That Tell a Story</h2>
            <p className="section-lead">Every route is hand-crafted to reveal something you wouldn't find on your own.</p>
          </div>
          <div className="tour-card-grid">
            {TOURS.map((t) => (
              <div key={t.slug} className="tour-card">
                <div className="tour-card-image" style={{ background: t.gradient }}>
                  <span className="tour-card-price">{t.price}<small> /person</small></span>
                </div>
                <div className="tour-card-body">
                  <div className="tour-card-meta">
                    <span className="tour-chip">{t.duration}</span>
                    <span className="tour-chip">{t.groupSize}</span>
                  </div>
                  <h3>{t.name}</h3>
                  <p className="tour-card-tagline">{t.tagline}</p>
                  <ul className="tour-highlights">
                    {t.highlights.map((h) => (
                      <li key={h}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link to={`/book/${t.slug}`} className="tour-book-btn">Reserve a Spot</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-how">
        <div className="landing-section">
          <div className="landing-section-header">
            <p className="section-eyebrow">THE EXPERIENCE</p>
            <h2>Book to Arrival in Minutes</h2>
            <p className="section-lead">Live technology makes your experience seamless — from booking to the moment your guide arrives.</p>
          </div>
          <div className="how-grid">
            <div className="how-card">
              <div className="how-step-num">01</div>
              <div className="how-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </div>
              <h4>Book Online</h4>
              <p>Pick your tour, choose a date and time, and secure your spot in minutes — right from your phone.</p>
            </div>
            <div className="how-card">
              <div className="how-step-num">02</div>
              <div className="how-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.07 9.81 19.79 19.79 0 011 1.18 2 2 0 013 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
              </div>
              <h4>Get Confirmation</h4>
              <p>Receive instant confirmation with all your details and a live tracking link ready for tour day.</p>
            </div>
            <div className="how-card">
              <div className="how-step-num">03</div>
              <div className="how-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
              <h4>Track Your Guide Live</h4>
              <p>On tour day, open your link to see your guide's real-time location — like Uber, but for adventures.</p>
            </div>
          </div>

          <div className="tracking-preview-card">
            <div className="tracking-preview-header">
              <span className="tracking-pulse-wrap"><span className="tracking-pulse-dot" /></span>
              <strong>Live Guide Tracking</strong>
              <span className="tracking-badge en-route">En Route · 4 min</span>
            </div>
            <p>Your guide shares their location in real time. Watch them navigate to your pickup point — no guessing, no waiting in the wrong spot.</p>
            <div className="tracking-preview-map-stub">
              <div className="tracking-map-pin driver-pin">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></svg>
              </div>
              <div className="tracking-map-road" />
              <div className="tracking-map-pin you-pin">YOU</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-section landing-footer-inner">
          <div className="footer-brand">
            <div className="footer-logo">
              <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
            <p>Guided tours that reveal the real story of this land.</p>
          </div>
          <div className="footer-links-col">
            <h5>Explore</h5>
            <Link to="/tours">All Tours</Link>
            <Link to="/book">Book Now</Link>
          </div>
          <div className="footer-links-col">
            <h5>Contact</h5>
            <a href="mailto:info@jwbethel.tours">info@jwbethel.tours</a>
          </div>
        </div>
        <div className="footer-copy-bar">
          <p>&copy; {new Date().getFullYear()} JW Bethel Tours. All rights reserved.</p>
          <Link to="/login" className="admin-portal-link">Admin Portal</Link>
        </div>
      </footer>
    </div>
  );
}
