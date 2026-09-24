export function RouteDataFallback({
  label,
  testId,
  presentation = "card",
}: {
  label: string;
  testId?: string;
  presentation?: "card" | "line";
}) {
  if (presentation === "line") {
    return (
      <p className="muted-text" aria-busy="true" aria-label={`Loading ${label}`} data-testid={testId}>
        Loading {label}…
      </p>
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
