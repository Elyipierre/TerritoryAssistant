export default function BrandLogo({ compact = false }) {
  return (
    <div className={`brand-lockup${compact ? ' compact' : ''}`} aria-label="Territory Assistant">
      <div className="brand-logo-shell">
        <img
          className="brand-logo-image"
          src="/assets/logo.png"
          alt="Territory Assistant"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            event.currentTarget.nextSibling.style.display = 'grid';
          }}
        />
        <div className="brand-logo-fallback" style={{ display: 'none' }}>
          TA
        </div>
      </div>
    </div>
  );
}
