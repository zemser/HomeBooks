import {
  signInWithGoogleAction,
  signInWithPasswordAction,
} from "@/features/auth/actions";

type SignInPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = params?.next ?? "/";

  return (
    <main>
      <div className="page-shell auth-shell">
        <section className="auth-hero">
          <span className="eyebrow">Private access</span>
          <h1>Welcome back to your household workspace.</h1>
          <p>Sign in to manage shared household money.</p>
        </section>

        {params?.error ? <p className="status error">{params.error}</p> : null}

        <section className="auth-layout auth-layout-single">
          <div className="card auth-card stack">
            <form action={signInWithPasswordAction} className="stack">
              <div className="auth-card-header">
                <h2>Sign in</h2>
                <p className="muted-text">
                  Use your email and password, or continue with the Google account connected in
                  Supabase Auth.
                </p>
              </div>
              <input name="next" type="hidden" value={next} />
              <label className="field">
                <span>Email</span>
                <input className="input" name="email" required type="email" />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" name="password" required type="password" />
              </label>
              <button className="button auth-button" type="submit">
                Sign in
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form action={signInWithGoogleAction}>
              <input name="next" type="hidden" value={next} />
              <button className="button button-secondary auth-button" type="submit">
                Continue with Google
              </button>
            </form>
            <p className="auth-note">
              Need first-time access? <a href="/sign-up">Create the first account</a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
