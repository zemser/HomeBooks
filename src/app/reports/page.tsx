const reportViews = [
  "Monthly adjusted summary",
  "Yearly average spend and income",
  "Trailing 12-month savings trend",
  "Category breakdown in workspace currency",
];

export default function ReportsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Reports</span>
          <h1>One month matters, but the story is in the trend.</h1>
          <p>
            Reporting will aggregate expense allocations, recurring entries, and FX-normalized
            values into views that help the household understand how money behaves over time.
          </p>
        </section>

        <section className="card">
          <h2>Target views</h2>
          <ul>
            {reportViews.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

