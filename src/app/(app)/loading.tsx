export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading page">
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Loading</span>
          <h1>Loading workspace…</h1>
          <p>Please wait while the latest workspace data is loaded.</p>
        </section>
      </div>
    </main>
  );
}
