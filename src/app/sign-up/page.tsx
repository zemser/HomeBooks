import { signUpWithPasswordAction } from "@/features/auth/actions";

type SignUpPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;

  return (
    <main>
      <div className="page-shell auth-shell">
        <section className="auth-hero">
          <span className="eyebrow">First setup</span>
          <h1>Create the first account.</h1>
          <p>Use this once to create the private household workspace owner.</p>
        </section>

        {params?.error ? <p className="status error">{params.error}</p> : null}

        <section className="auth-layout auth-layout-single">
          <form action={signUpWithPasswordAction} className="card auth-card stack">
            <div className="auth-card-header">
              <h2>Create account</h2>
              <p className="muted-text">
                You can sign in with this email after the account is created.
              </p>
            </div>
            <label className="field">
              <span>Display name</span>
              <input className="input" name="displayName" required type="text" />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" name="email" required type="email" />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                autoComplete="new-password"
                className="input"
                minLength={10}
                name="password"
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,}"
                required
                title="Use at least 10 characters with uppercase, lowercase, and a number."
                type="password"
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                className="input"
                minLength={10}
                name="confirmPassword"
                required
                type="password"
              />
            </label>
            <button className="button auth-button" type="submit">
              Create account
            </button>
            <p className="auth-note">
              Already have access? <a href="/sign-in">Sign in</a>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
