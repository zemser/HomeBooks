import {
  signInWithGoogleAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
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
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Private access</span>
          <h1>Sign in to your household workspace.</h1>
          <p>
            Hosted mode uses Supabase Auth while the finance data stays behind the app workspace
            model.
          </p>
        </section>

        {params?.error ? <p className="status error">{params.error}</p> : null}

        <section className="two-up">
          <form action={signInWithPasswordAction} className="card stack">
            <div>
              <h2>Sign in</h2>
              <p className="muted-text">Use the email and password configured for this private app.</p>
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
            <button className="button" type="submit">
              Sign in
            </button>
          </form>

          <form action={signInWithGoogleAction} className="card stack">
            <div>
              <h2>Sign in with Google</h2>
              <p className="muted-text">
                Continue with the Google account enabled in Supabase Auth.
              </p>
            </div>
            <input name="next" type="hidden" value={next} />
            <button className="button button-secondary" type="submit">
              Continue with Google
            </button>
          </form>

          <form action={signUpWithPasswordAction} className="card stack">
            <div>
              <h2>Create first user</h2>
              <p className="muted-text">
                Use this only while setting up the two-user hosted version.
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
            <button className="button button-secondary" type="submit">
              Create account
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
