import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { GoogleContinueForm } from "@/components/auth/google-continue-form";
import { PasswordField } from "@/components/auth/password-field";
import { signUpWithPasswordAction } from "@/features/auth/actions";
import { PASSWORD_HINT, PASSWORD_PATTERN } from "@/features/auth/password";

type SignUpPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

async function SignUpForm({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <AuthScreen
      description="Create the first account for this private workspace."
      error={error}
      footer={
        <p className="auth-note">
          Already have access? <a href="/sign-in">Sign in</a>
        </p>
      }
      testId="sign-up-shell"
      title="Set up this household"
      trustLine="Data stays in this workspace."
    >
      <GoogleContinueForm from="sign-up" next="/onboarding" />

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form action={signUpWithPasswordAction} className="stack" id="sign-up" name="sign-up">
        <label className="field">
          <span>Email</span>
          <input
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            className="input"
            name="email"
            required
            spellCheck={false}
            type="email"
          />
        </label>
        <PasswordField
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          minLength={10}
          pattern={PASSWORD_PATTERN}
          title={PASSWORD_HINT}
        />
        <button className="button auth-button" type="submit">
          Create household
        </button>
      </form>
    </AuthScreen>
  );
}

export default function SignUpPage({ searchParams }: SignUpPageProps) {
  return (
    <Suspense fallback={<div className="card auth-card" aria-busy="true">Loading account setup…</div>}>
      <SignUpForm searchParams={searchParams} />
    </Suspense>
  );
}
