import { redirect } from "next/navigation";

import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";
import { createFirstWorkspaceAction } from "@/features/workspaces/onboarding";
import { getFinappAuthMode } from "@/lib/supabase/config";

type OnboardingPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  if (getFinappAuthMode() !== "supabase") {
    redirect("/");
  }

  const user = await getSupabaseAuthenticatedUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const defaultDisplayName =
    (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "")
    || user.email?.split("@")[0]
    || "";

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">First setup</span>
          <h1>Create your household workspace.</h1>
          <p>
            This connects your Supabase identity to the app-level user, workspace, and owner member
            records.
          </p>
        </section>

        {params?.error ? <p className="status error">{params.error}</p> : null}

        <form action={createFirstWorkspaceAction} className="card stack">
          <label className="field">
            <span>Workspace name</span>
            <input
              className="input"
              defaultValue="Household Workspace"
              name="workspaceName"
              required
              type="text"
            />
          </label>
          <label className="field">
            <span>Your display name</span>
            <input
              className="input"
              defaultValue={defaultDisplayName}
              name="displayName"
              required
              type="text"
            />
          </label>
          <label className="field">
            <span>Base currency</span>
            <input
              className="input"
              defaultValue="ILS"
              maxLength={3}
              minLength={3}
              name="baseCurrency"
              required
              type="text"
            />
          </label>
          <button className="button" type="submit">
            Create workspace
          </button>
        </form>
      </div>
    </main>
  );
}
