const settingsAreas = [
  "Workspace base currency",
  "Household members",
  "Import source preferences",
  "Recurring defaults and reporting rules",
];

export default function SettingsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Settings</span>
          <h1>Household configuration lives here.</h1>
          <p>
            Base currency, workspace members, and reporting defaults should be explicit
            because they shape every import and summary.
          </p>
        </section>

        <section className="card">
          <h2>Core settings</h2>
          <ul>
            {settingsAreas.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
