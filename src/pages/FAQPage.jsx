import { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { FaqIcon, SparklesIcon } from '../components/Icons';
import { useWorkspaceSnapshot } from '../hooks/useWorkspaceSnapshot';
import { badgeLabelForStatusCode, toneForStatusCode } from '../utils/presentation';

const STATUS_CODES = ['CM', 'NA', 'DNC', 'OL'];

function AccordionItem({ title, children, open, onToggle }) {
  return (
    <article className={`faq-accordion-item${open ? ' open' : ''}`}>
      <button type="button" className="faq-accordion-trigger" onClick={onToggle}>
        <span>{title}</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="faq-accordion-body">{children}</div> : null}
    </article>
  );
}

export default function FAQPage() {
  const { metrics, summary, loading } = useWorkspaceSnapshot();
  const [openItem, setOpenItem] = useState('claim');

  const faqs = useMemo(() => ([
    {
      id: 'claim',
      title: 'How do I claim a territory?',
      body: `Open Territory Atlas or Territories, select a live polygon, and use the Claim action. Right now the enabled pool contains ${summary.enabled} enabled territories.`
    },
    {
      id: 'workflow',
      title: 'How does the address workflow work?',
      body: `Use the Home Dashboard workflow drawer to select an address, assign a disposition code, and save it directly to the address log. The project currently has ${metrics.addressLogCount} logged address outcomes.`
    },
    {
      id: 'campaigns',
      title: 'What happens during campaign mode?',
      body: `Campaigns affect priorities and reporting across the dashboard. There are currently ${metrics.activeCampaignCount} active campaigns reflected in the live data.`
    },
    {
      id: 'dnc',
      title: 'How are Do Not Call records handled?',
      body: `DNC rows are managed from the Admin Panel compliance registry and are included in document exports when verified. The live registry currently contains ${metrics.dncCount} DNC records.`
    },
    {
      id: 'admin',
      title: 'When should I escalate to an admin?',
      body: 'Escalate when you find duplicate ownership, missing geocodes, boundary mismatches, or access approval issues. Those workflows live in the Admin Panel under Data Enrichment and Access Provisioning.'
    }
  ]), [metrics.activeCampaignCount, metrics.addressLogCount, metrics.dncCount, summary.enabled]);

  return (
    <AppShell
      title="FAQ"
      subtitle="A readable support and documentation hub with standard operating procedures and the current status-code legend."
      metaPills={[
        { label: `${summary.enabled} Enabled Territories`, tone: 'light' },
        { label: `${metrics.activeCampaignCount} Active Campaigns`, tone: 'dark' }
      ]}
      contentClassName="faq-page-shell"
    >
      <section className="glass-panel faq-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow-label">Support Center</span>
            <h2>Standard Operating Procedures</h2>
            <p>{loading ? 'Loading the latest workspace context.' : `This live snapshot covers ${metrics.territoryCount} territories, ${metrics.assignmentCount} assignment events, and ${metrics.addressLogCount} logged outcomes.`}</p>
          </div>
        </div>

        <div className="faq-layout-grid">
          <div className="faq-accordion-list">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} title={faq.title} open={openItem === faq.id} onToggle={() => setOpenItem((current) => current === faq.id ? '' : faq.id)}>
                <p>{faq.body}</p>
              </AccordionItem>
            ))}
          </div>

          <aside className="faq-legend-panel">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow-label">Status Code Legend</span>
                <h2>Field Dispositions</h2>
              </div>
            </div>

            <div className="legend-table">
              {STATUS_CODES.map((code) => (
                <div key={code} className="legend-row">
                  <span className={`status-pill ${toneForStatusCode(code)}`}>{code}</span>
                  <div>
                    <strong>{badgeLabelForStatusCode(code)}</strong>
                    <p>{code === 'CM' ? 'Successful ministry contact' : code === 'NA' ? 'No answer / not at home' : code === 'DNC' ? 'Do not call or restricted' : 'Other language requested'}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="empty-inline-card">
              <SparklesIcon />
              <p>Use this legend when training publishers, reviewing logs, or preparing territory exports.</p>
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
