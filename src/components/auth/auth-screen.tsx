import { AuthAutofocus } from "@/components/auth/auth-autofocus";

type AuthScreenProps = {
  children: React.ReactNode;
  description: string;
  error?: string;
  footer: React.ReactNode;
  testId: string;
  title: string;
  trustLine: string;
};

export function AuthScreen({
  children,
  description,
  error,
  footer,
  testId,
  title,
  trustLine,
}: AuthScreenProps) {
  return (
    <main>
      <div className="page-shell auth-shell">
        <section className="auth-brand">
          <span className="app-brand-mark" aria-hidden="true">
            FA
          </span>
          <p>Private household money, for the people who live here.</p>
        </section>

        <section className="card auth-card stack" data-testid={testId}>
          <AuthAutofocus target={error ? "email" : "google"} />

          {error ? (
            <p className="status error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="auth-card-header">
            <h1>{title}</h1>
            <p className="muted-text">{description}</p>
          </div>

          {children}

          <p className="auth-trust">{trustLine}</p>
          {footer}
        </section>
      </div>
    </main>
  );
}
