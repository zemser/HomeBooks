const highlights = [
  "Household snapshot cards",
  "Average monthly savings",
  "Trailing 12-month spending",
  "Latest import health",
];

export default function DashboardPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Dashboard</span>
          <h1>Reporting should feel annual, not only monthly.</h1>
          <p>
            This page will become the household command center for yearly averages,
            trend cards, and the latest finance health signals.
          </p>
        </section>

        <section className="card">
          <h2>Planned first dashboard elements</h2>
          <ul>
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

