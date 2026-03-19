const priorities = [
  {
    title: "Import first",
    body: "Upload bank CSV or Excel exports, map them into normalized transactions, and preserve the original file for auditability.",
  },
  {
    title: "Review only uncertainty",
    body: "Users should confirm ambiguous items, while merchant rules and history keep the monthly review workload small.",
  },
  {
    title: "Report by period",
    body: "Monthly summaries matter, but yearly averages and trailing trends should drive the household view.",
  },
];

const dataLayers = [
  "raw import file and staging rows",
  "normalized transactions and manual entries",
  "expense events and month allocations",
  "period summaries in workspace currency",
];

const firstSlice = [
  "Workspace setup and base currency",
  "One bank import flow using a real example file",
  "Classification review queue",
  "Recurring rent and salary entries",
  "Monthly and yearly reporting cards",
];

export default function HomePage() {
  return (
    <main>
      <div className="page-shell">
        <section className="hero">
          <span className="eyebrow">Finance app scaffold</span>
          <h1>Shared money tracking for couples and families.</h1>
          <p>
            This repo now has the first implementation scaffold for the product we defined:
            a low-cost finance workspace with imports, recurring entries, currency normalization,
            and period-based reporting.
          </p>
        </section>

        <p className="section-title">Priorities</p>
        <section className="grid cards">
          {priorities.map((item) => (
            <article className="card" key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </section>

        <p className="section-title">Core data flow</p>
        <section className="two-up">
          <article className="card">
            <h3>Data layers</h3>
            <ul>
              {dataLayers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="card">
            <h3>First vertical slice</h3>
            <ul>
              {firstSlice.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}

