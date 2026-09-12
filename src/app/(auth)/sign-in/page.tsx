import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { GoogleContinueForm } from "@/components/auth/google-continue-form";
import { PasswordField } from "@/components/auth/password-field";
import { signInWithPasswordAction } from "@/features/auth/actions";

type SignInPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

async function SignInForm({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const error = params?.error;
  const next = params?.next ?? "/";

  return (
    <AuthScreen
      description="Continue to manage shared household money."
      error={error}
      footer={
        <p className="auth-note">
          Need first-time access? <a href="/sign-up">Create the first account</a>
        </p>
      }
      testId="sign-in-shell"
      title="Welcome back"
      trustLine="Then you’ll confirm a second-factor code. Data stays in this workspace."
    >
      <GoogleContinueForm from="sign-in" next={next} />

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form action={signInWithPasswordAction} className="stack" id="sign-in" name="sign-in">
        <input name="next" type="hidden" value={next} />
        <label className="field">
          <span>Email</span>
          <input
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            className="input"
            name="email"
            required
            spellCheck={false}
            type="email"
          />
        </label>
        <PasswordField autoComplete="current-password" />
        <button className="button auth-button" type="submit">
          Sign in with email
        </button>
      </form>
    </AuthScreen>
  );
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <Suspense fallback={<div className="card auth-card" aria-busy="true">Loading sign-in…</div>}>
      <SignInForm searchParams={searchParams} />
    </Suspense>
  );
}
