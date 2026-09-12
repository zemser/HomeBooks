import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { withDbTransaction } from "@/db";
import { workspaceMembers } from "@/db/schema";
import {
  AuthContextError,
  requireAal2Context,
} from "@/features/auth/supabase-user";
import { displayNameFromAuth, ensureAppUser } from "@/features/workspaces/app-user";
import {
  acceptWorkspaceInviteAction,
  declineWorkspaceInviteAction,
} from "@/features/workspaces/invite-actions";
import { listPendingInvitesForEmail } from "@/features/workspaces/invites";
import { createFirstWorkspaceAction } from "@/features/workspaces/onboarding";
import { getFinappAuthMode } from "@/lib/supabase/config";

type OnboardingPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

async function OnboardingForm({ searchParams }: OnboardingPageProps) {
  if (getFinappAuthMode() !== "supabase") {
    redirect("/");
  }

  let user;
  try {
    user = await requireAal2Context();
  } catch (error) {
    if (error instanceof AuthContextError) {
      redirect(error.status === 401 ? "/sign-in" : "/mfa?next=/onboarding");
    }
    throw error;
  }

  const { existingMember, invites } = await withDbTransaction(user.userId, async (db) => {
    const existingMember = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.userId, user.userId),
        eq(workspaceMembers.isActive, true),
      ),
    });

    if (existingMember) {
      return { existingMember, invites: [] };
    }

    const appUser = await ensureAppUser(db, user);
    const invites = await listPendingInvitesForEmail(db, appUser.email);
    return { existingMember: null, invites };
  });

  if (existingMember) {
    redirect("/");
  }

  const params = await searchParams;
  const defaultDisplayName = displayNameFromAuth(user, "");
  const hasInvites = invites.length > 0;

  return (
    <>
        {params?.error ? <p className="status error">{params.error}</p> : null}

        {hasInvites ? (
          <section className="stack compact">
            {invites.map((invite) => (
              <article className="card stack" key={invite.id}>
                <div>
                  <h2>Join {invite.workspaceName}</h2>
                  <p className="muted-text">
                    {invite.invitedByDisplayName} invited {invite.invitedEmail} to this household.
                    Sign-in email must match.
                  </p>
                </div>
                <div className="action-row">
                  <form action={acceptWorkspaceInviteAction}>
                    <input name="inviteId" type="hidden" value={invite.id} />
                    <button className="button" type="submit">
                      Join workspace
                    </button>
                  </form>
                  <form action={declineWorkspaceInviteAction}>
                    <input name="inviteId" type="hidden" value={invite.id} />
                    <button className="button button-secondary" type="submit">
                      Decline
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <form action={createFirstWorkspaceAction} className="card stack">
          <div>
            <h2>{hasInvites ? "Or create your own workspace" : "Create your household workspace"}</h2>
            <p className="muted-text">
              {hasInvites
                ? "You can still start a separate household. Joining later stays available from settings."
                : "Choose a name, your display name, and the currency your household uses."}
            </p>
          </div>
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
    </>
  );
}

export default function OnboardingPage({ searchParams }: OnboardingPageProps) {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="onboarding-shell">
          <div>
            <span className="eyebrow">First setup</span>
            <h1>Set up your household</h1>
            <p>Join an invite if you have one, or create a new workspace.</p>
          </div>
        </section>
        <Suspense fallback={<section className="card" aria-busy="true">Loading workspace setup…</section>}>
          <OnboardingForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
