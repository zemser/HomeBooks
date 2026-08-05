import { redirect } from "next/navigation";

import { MfaEnrollmentClient } from "@/components/auth/mfa-enrollment-client";
import { verifyExistingTotpAction } from "@/features/auth/mfa-actions";
import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordMfaCall, withTelemetryOperation, withTelemetrySpan } from "@/lib/telemetry/server";

type MfaPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

function getSafeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const params = await searchParams;
  const next = getSafeNext(params?.next);
  const user = await getSupabaseAuthenticatedUser();

  if (!user) {
    redirect("/sign-in");
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: assuranceData }, { data: factorData, error: factorError }] =
    await withTelemetryOperation({ operation: "mfa.page" }, async () => {
      recordMfaCall();
      recordMfaCall();
      return Promise.all([
        withTelemetrySpan("mfa.assurance-level", () =>
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ),
        withTelemetrySpan("mfa.list-factors", () => supabase.auth.mfa.listFactors()),
      ]);
    });

  if (assuranceData?.currentLevel === "aal2") {
    redirect(next);
  }

  const verifiedTotpFactor = factorData?.totp.find((factor) => factor.status === "verified");

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Second factor</span>
          <h1>Verify your authenticator.</h1>
          <p>
            The hosted two-user version requires a verified TOTP code before opening the household
            finance workspace.
          </p>
        </section>

        {params?.error ? <p className="status error">{params.error}</p> : null}
        {factorError ? <p className="status error">{factorError.message}</p> : null}

        {verifiedTotpFactor ? (
          <form action={verifyExistingTotpAction} className="card stack">
            <div>
              <h2>Enter authenticator code</h2>
              <p className="muted-text">
                Use the 6-digit code from your verified authenticator app.
              </p>
            </div>
            <input name="factorId" type="hidden" value={verifiedTotpFactor.id} />
            <input name="next" type="hidden" value={next} />
            <label className="field">
              <span>Authenticator code</span>
              <input
                autoComplete="one-time-code"
                className="input"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="code"
                pattern="[0-9]{6}"
                required
                type="text"
              />
            </label>
            <button className="button" type="submit">
              Verify and continue
            </button>
          </form>
        ) : (
          <MfaEnrollmentClient next={next} />
        )}
      </div>
    </main>
  );
}
