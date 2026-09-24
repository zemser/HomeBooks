export function RouteDataFallback({
  label,
  testId,
  presentation = "card",
}: {
  label: string;
  testId?: string;
  presentation?: "card" | "spinner";
}) {
  if (presentation === "spinner") {
    return (
      <div className="route-loader" role="status" aria-busy="true" data-testid={testId}>
        <span className="route-loader-spinner" aria-hidden="true" />
        <span className="sr-only">Loading {label}</span>
      </div>
    );
  }

  return (
    <section
      className="card stack compact"
      aria-busy="true"
      aria-label={`Loading ${label}`}
      data-testid={testId}
    >
      <h2>{label}</h2>
      <p className="muted-text">Loading current workspace data…</p>
      <div className="summary-strip" aria-hidden="true">
        <div><strong>—</strong><span>Loading</span></div>
        <div><strong>—</strong><span>Loading</span></div>
        <div><strong>—</strong><span>Loading</span></div>
      </div>
    </section>
  );
}
