export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading page" data-testid="route-loading-shell">
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Loading</span>
            <h1>Loading page…</h1>
            <p>The page frame is ready while current workspace data streams in.</p>
          </div>
        </section>
        <section className="card stack compact">
          <div className="summary-strip" aria-hidden="true">
            <div><strong>—</strong><span>Loading</span></div>
            <div><strong>—</strong><span>Loading</span></div>
            <div><strong>—</strong><span>Loading</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
