"use client";

import Link from "next/link";

type AppErrorStateProps = {
  digest?: string;
  homeHref?: string;
  onReset?: () => void;
  showSettingsLink?: boolean;
  title?: string;
};

export function AppErrorState({
  digest,
  homeHref = "/",
  onReset,
  showSettingsLink = true,
  title = "Something got tangled up.",
}: AppErrorStateProps) {
  return (
    <main className="app-error-shell">
      <section className="app-error-card" aria-labelledby="app-error-title">
        <span className="eyebrow">Fin App</span>
        <div className="app-error-copy">
          <h1 id="app-error-title">{title}</h1>
          <p>
            The workspace did not finish loading. Try again, or head back to the
            app home and reopen the page from there.
          </p>
        </div>

        <div className="app-error-actions">
          {onReset ? (
            <button className="button" type="button" onClick={onReset}>
              Try again
            </button>
          ) : null}
          <Link className="button button-secondary" href={homeHref}>
            Back to app home
          </Link>
          {showSettingsLink ? (
            <Link className="button button-secondary" href="/settings">
              Open settings
            </Link>
          ) : null}
        </div>

        {digest ? <p className="app-error-digest">Error ID: {digest}</p> : null}
      </section>
    </main>
  );
}
