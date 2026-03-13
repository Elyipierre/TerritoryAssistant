export default function KpiCard({ label, value, helper, accent = 'teal', icon = null }) {
  return (
    <article className={`kpi-card accent-${accent}`}>
      <div className="kpi-card-top">
        <p className="kpi-label">{label}</p>
        {icon ? <span className="kpi-icon-shell">{icon}</span> : null}
      </div>
      <h3>{value}</h3>
      {helper ? <span className="kpi-helper">{helper}</span> : null}
    </article>
  );
}
