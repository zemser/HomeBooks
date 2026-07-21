import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { runWithDatabaseUser } from "@/db/request-context";
import { workspaceMembers } from "@/db/schema";
import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";
import { createFirstWorkspaceAction } from "@/features/workspaces/onboarding";
import { getFinappAuthMode } from "@/lib/supabase/config";
import { and, eq } from "drizzle-orm";

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

  const existingMember = await runWithDatabaseUser(user.id, () =>
    getDb().query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)),
    }),
  );

  if (existingMember) {
    redirect("/");
  }

  const params = await searchParams;
  const defaultDisplayName =
    (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "")
    || user.email?.split("@")[0]
    || "";

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">First setup</span>
            <h1>Create your household workspace</h1>
            <p>Choose a name, your display name, and the currency your household uses.</p>
          </div>
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
              className="input currency-input"
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
