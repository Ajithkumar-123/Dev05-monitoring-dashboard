// Help view — how each tab works, glossary, FAQ, keyboard shortcuts. Static
// content, no data fetches. Lives in-app so even an offline demo can answer
// "what does this do?".
import { useState } from "react";

type Section = "tabs" | "files" | "stages" | "modes" | "shortcuts" | "faq" | "support";

const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
  { id: "tabs",      label: "Tab guide",          icon: "🧭" },
  { id: "files",     label: "Supported files",    icon: "📄" },
  { id: "stages",    label: "Pipeline stages",    icon: "🌊" },
  { id: "modes",     label: "Data source modes",  icon: "🔌" },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: "⌨️" },
  { id: "faq",       label: "FAQ",                icon: "❓" },
  { id: "support",   label: "Contact support",    icon: "✉️" },
];

const SUPPORT_EMAIL = "docuploader-support@opus2.com";
const SUPPORT_INCIDENT_EMAIL = "incident@opus2.com";

export function HelpView() {
  const [section, setSection] = useState<Section>("tabs");

  return (
    <div className="docu-help">
      <aside className="docu-help__sidebar">
        <div className="docu-help__sidebar-title">Topics</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`docu-help__sidebar-item ${section === s.id ? "docu-help__sidebar-item--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </aside>

      <article className="docu-help__content">
        {section === "tabs" && <TabsGuide />}
        {section === "files" && <FilesGuide />}
        {section === "stages" && <StagesGuide />}
        {section === "modes" && <ModesGuide />}
        {section === "shortcuts" && <ShortcutsGuide />}
        {section === "faq" && <FAQ />}
        {section === "support" && <Support />}
      </article>
    </div>
  );
}

function TabsGuide() {
  const tabs = [
    { icon: "🏠", name: "Home",       desc: "Landing page — overview, quick actions, recent alerts, deployment status." },
    { icon: "📤", name: "Upload",     desc: "Drop files, watch them flow through the pipeline. Mock — nothing leaves your browser. Outputs (PDF / OCR text / metadata JSON) are downloadable when each doc completes." },
    { icon: "🌊", name: "Pipeline",   desc: "Real-time funnel of docs across pipeline stages, file-type donut, throughput line, recent batches table. Click any batch for per-document detail + download options." },
    { icon: "👥", name: "Tenants",    desc: "Per-workspace breakdown — docs/day, storage, success rate, error leaderboard. Click any row for a deep-dive drawer with files list (view attempts are blocked: tenant data isolation)." },
    { icon: "⚙️", name: "Operations", desc: "22 service health tiles in 6 archetype groups, system-metrics chart, live event feed, searchable logs with time-range filter (5m → 24h or custom)." },
    { icon: "📖", name: "Runbook",    desc: "Embedded view of the dev05 deployment runbook. Read-only." },
    { icon: "❓", name: "Help",       desc: "What you're reading right now." },
  ];
  return (
    <>
      <h1>Tab guide</h1>
      <p>The sidebar on the left has these tabs:</p>
      <div className="docu-help__list">
        {tabs.map((t) => (
          <div key={t.name} className="docu-help__list-item">
            <span className="docu-help__list-icon">{t.icon}</span>
            <div>
              <div className="docu-help__list-title">{t.name}</div>
              <div className="docu-help__list-desc">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FilesGuide() {
  const types = [
    { type: "PDF",         exts: ".pdf",                          path: "classification → ocr → assembly" },
    { type: "Word",        exts: ".docx, .doc",                   path: "classification → conversion → assembly" },
    { type: "Excel",       exts: ".xlsx, .xls",                   path: "classification → conversion → assembly" },
    { type: "PowerPoint",  exts: ".pptx, .ppt",                   path: "classification → conversion → assembly" },
    { type: "Email",       exts: ".eml, .msg",                    path: "classification → extraction → ocr → assembly" },
    { type: "Archive",     exts: ".zip",                          path: "classification → extraction → assembly" },
    { type: "Image",       exts: ".jpg, .png, .heic, .tiff, .webp", path: "classification → ocr → assembly" },
    { type: "Audio/Video", exts: ".mp4, .m4a, .wav, .mov",       path: "classification → conversion → assembly" },
    { type: "Other",       exts: "anything else",                 path: "classification → conversion → assembly" },
  ];
  return (
    <>
      <h1>Supported files</h1>
      <p>
        Docuploader handles 9 file-type families. Each takes a slightly different
        path through the pipeline — for example, PDFs skip "conversion" because
        they're already PDFs.
      </p>
      <table className="docu-help__table">
        <thead>
          <tr>
            <th>Family</th>
            <th>Extensions</th>
            <th>Pipeline path</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.type}>
              <td><strong>{t.type}</strong></td>
              <td><code>{t.exts}</code></td>
              <td className="docu-help__path">{t.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="docu-help__note">
        Stages not listed above ("extraction" for non-archive types, "ocr" for
        spreadsheets, etc.) are <strong>SKIPPED</strong> for that file type.
      </p>
    </>
  );
}

function StagesGuide() {
  const stages = [
    { name: "received",       desc: "Initial state — file accepted, idempotency check passed.", duration: "<1s" },
    { name: "classification", desc: "Magic-byte detection; routes to the right downstream service queue.", duration: "0.5-2s" },
    { name: "extraction",     desc: "Unzip archives or parse email MIME bodies into child documents.", duration: "1-5s" },
    { name: "conversion",     desc: "Office → PDF via Aspose; HTML → PDF via gotenberg; images → TIFF.", duration: "2-20s" },
    { name: "ocr",            desc: "Text extraction from PDFs and images (Tesseract or Textract).", duration: "1-30s" },
    { name: "assembly",       desc: "Stitch outputs into the final bundle, write to S3, update doc state.", duration: "0.5-3s" },
    { name: "completed",      desc: "Terminal state — outputs available for download.", duration: "—" },
    { name: "failed",         desc: "Terminal state — at least one stage hit an unrecoverable error.", duration: "—" },
  ];
  return (
    <>
      <h1>Pipeline stages</h1>
      <p>
        Every uploaded document moves through a state machine. The terminal
        states are <strong>completed</strong> or <strong>failed</strong>.
      </p>
      <div className="docu-help__list docu-help__list--stages">
        {stages.map((s) => (
          <div key={s.name} className="docu-help__list-item">
            <code className="docu-help__list-tag">{s.name}</code>
            <div>
              <div className="docu-help__list-desc">{s.desc}</div>
              <div className="docu-help__list-meta">Typical duration: {s.duration}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ModesGuide() {
  return (
    <>
      <h1>Data source modes</h1>
      <p>
        The dashboard can run against three different data sources. The current
        mode shows as a pill in the top auto-refresh bar.
      </p>
      <div className="docu-help__modes">
        <div className="docu-help__mode docu-help__mode--mock">
          <div className="docu-help__mode-head">
            <span className="docu-help__mode-pill">MOCK</span>
            <span className="docu-help__mode-desc">Default. Browser generates everything.</span>
          </div>
          <p>No network, no AWS, no backend. Useful for demos, offline, UI design. Footer shows a <code>MOCK DATA</code> badge.</p>
        </div>
        <div className="docu-help__mode docu-help__mode--aggregator">
          <div className="docu-help__mode-head">
            <span className="docu-help__mode-pill">AGGREGATOR</span>
            <span className="docu-help__mode-desc">Single backend endpoint serves snapshots.</span>
          </div>
          <p>Set <code>VITE_HEALTH_MODE=live</code> + <code>VITE_HEALTH_AGGREGATOR_URL=https://...</code>. The aggregator (<code>monitor-aggregator-service</code>) probes each service server-side. One CORS rule, real data.</p>
        </div>
        <div className="docu-help__mode docu-help__mode--direct">
          <div className="docu-help__mode-head">
            <span className="docu-help__mode-pill">DIRECT</span>
            <span className="docu-help__mode-desc">Browser polls each service directly.</span>
          </div>
          <p>Set <code>VITE_HEALTH_MODE=live</code> + <code>VITE_HEALTH_URL_PATTERN=https://{`{unit}`}.dev05.k8s.opus2dev.com</code>. Needs every service to allow CORS for the dashboard origin.</p>
        </div>
      </div>
    </>
  );
}

function ShortcutsGuide() {
  return (
    <>
      <h1>Keyboard shortcuts</h1>
      <p>
        The dashboard relies mostly on click / drag interactions, but a few
        keys do something useful:
      </p>
      <table className="docu-help__table">
        <thead>
          <tr><th>Key</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr><td><kbd>Esc</kbd></td><td>Close any open drawer or modal</td></tr>
          <tr><td><kbd>Tab</kbd></td><td>Move focus through sidebar nav, table rows, buttons</td></tr>
          <tr><td><kbd>Enter</kbd> / <kbd>Space</kbd></td><td>Activate the focused row (open drawer)</td></tr>
          <tr><td><kbd>Ctrl+Shift+R</kbd></td><td>Hard refresh — useful when CSS changes during dev</td></tr>
          <tr><td><kbd>F12</kbd></td><td>Open browser DevTools (see Network for real / mock traffic)</td></tr>
        </tbody>
      </table>
      <p className="docu-help__note">
        Tab selection is persisted to the URL hash (e.g. <code>#tenants</code>)
        + <code>localStorage</code> so refresh keeps you on the same view.
      </p>
    </>
  );
}

function Support() {
  const subject = encodeURIComponent("Docuploader monitor — support request");
  const body = encodeURIComponent(
    "Hi Docuploader team,\n\n" +
    "I need help with:\n\n" +
    "[ please describe the issue, including ]\n" +
    "  • workspace / tenant slug\n" +
    "  • batch or document ID if any\n" +
    "  • approximate time it happened (UTC)\n" +
    "  • what you expected vs what you saw\n\n" +
    "Thanks!\n"
  );
  const incidentSubject = encodeURIComponent("[INCIDENT] Docuploader — production issue");
  return (
    <>
      <h1>Contact support</h1>
      <p>
        For questions, bug reports, or onboarding help, email the
        Docuploader team. We aim to respond within one business day.
      </p>

      <div className="docu-help__contact">
        <div className="docu-help__contact-card">
          <div className="docu-help__contact-icon">✉️</div>
          <div className="docu-help__contact-body">
            <div className="docu-help__contact-title">General support</div>
            <div className="docu-help__contact-desc">
              How-to questions, configuration help, feature requests, bug reports.
            </div>
            <a
              className="docu-help__contact-link"
              href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}
            >
              <code>{SUPPORT_EMAIL}</code> ↗
            </a>
            <div className="docu-help__contact-sub">Response window: 1 business day</div>
          </div>
        </div>

        <div className="docu-help__contact-card docu-help__contact-card--urgent">
          <div className="docu-help__contact-icon">🚨</div>
          <div className="docu-help__contact-body">
            <div className="docu-help__contact-title">Production incident</div>
            <div className="docu-help__contact-desc">
              Use for outages, data integrity issues, security concerns. Pages oncall.
            </div>
            <a
              className="docu-help__contact-link"
              href={`mailto:${SUPPORT_INCIDENT_EMAIL}?subject=${incidentSubject}`}
            >
              <code>{SUPPORT_INCIDENT_EMAIL}</code> ↗
            </a>
            <div className="docu-help__contact-sub">Response window: 15 minutes (oncall)</div>
          </div>
        </div>
      </div>

      <h2 className="docu-help__contact-h2">Before you email — useful info to include</h2>
      <ul className="docu-help__contact-checklist">
        <li>Your workspace slug (e.g. <code>acme-legal</code>)</li>
        <li>The relevant batch ID or document ID, if any</li>
        <li>Approximate timestamp the issue started (UTC preferred)</li>
        <li>What you expected to happen vs what you saw</li>
        <li>Browser + OS if it's a UI bug</li>
        <li>Screenshot or short screen recording if it helps</li>
      </ul>

      <h2 className="docu-help__contact-h2">Other channels</h2>
      <ul className="docu-help__contact-checklist">
        <li>Status page: <a href="#" className="docu-help__contact-inline">status.opus2.com</a> (live AWS service health)</li>
        <li>Documentation portal: <a href="#" className="docu-help__contact-inline">docs.opus2.com/docuploader</a></li>
        <li>Slack (employees only): <code>#docuploader-help</code></li>
        <li>Jira project: <code>DOCUP</code> (filed via <code>{SUPPORT_EMAIL}</code> auto-routes here)</li>
      </ul>

      <div className="docu-help__contact-note">
        <strong>Privacy note.</strong> Don't paste document contents into support email — only
        IDs and metadata. Tenant data isolation rules require us to access
        content through formal data-request workflows.
      </div>
    </>
  );
}

function FAQ() {
  const items = [
    {
      q: "Why does every service show DOWN in Operations?",
      a: "You're in live mode pointing at services that aren't actually running. Either flip back to mock (unset VITE_HEALTH_MODE), start the aggregator stub, or deploy the services to EKS.",
    },
    {
      q: "Are the upload outputs real files?",
      a: "The PDF output is the original file bytes echoed back. The OCR text and metadata JSON are synthesized stubs. Everything is generated in the browser — nothing is uploaded to AWS in mock mode.",
    },
    {
      q: "Why can't I open a tenant's files?",
      a: "Intentional. Tenant data isolation: admin can see metadata (filename, size, upload time) but not content. In production, file content is gated by IAM + workspace membership.",
    },
    {
      q: "What does the 'aggregator' do?",
      a: "It's a small Go service (units/monitor-aggregator-service) that polls each docuploader unit's /healthz internally and exposes one /api/snapshot endpoint for the dashboard. Avoids 22 cross-origin browser fetches per tick.",
    },
    {
      q: "Why is Aspose always DOWN?",
      a: "The Aspose container couldn't be built because it needs the vendor's Conan remote credentials + Aspose.Total license. See the runbook's Phase B section for the unblock checklist.",
    },
    {
      q: "How do I share my current view?",
      a: "The URL updates as you navigate (#tenants, #pipeline, etc.). Just copy the URL — opening it elsewhere lands on the same tab.",
    },
    {
      q: "Where do notifications come from?",
      a: "Live errors from the SystemStatus polls (services flipping to DOWN/DEGRADED) and from upload failures. Stored in localStorage for 24 hours so refresh doesn't lose them.",
    },
  ];
  return (
    <>
      <h1>Frequently asked</h1>
      <div className="docu-help__faq">
        {items.map((it, i) => (
          <details key={i} className="docu-help__faq-item">
            <summary>{it.q}</summary>
            <p>{it.a}</p>
          </details>
        ))}
      </div>
    </>
  );
}
