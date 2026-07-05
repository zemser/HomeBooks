import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { runWithDatabaseUser, setCurrentDatabaseUserId } from "@/db/request-context";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";
import { getFinappAuthMode } from "@/lib/supabase/config";

const DEFAULT_USER_EMAIL = "dev@finapp.local";
const DEFAULT_USER_NAME = "Dev User";
const DEFAULT_WORKSPACE_NAME = "Household Workspace";
const DEFAULT_MEMBER_ROLE = "owner";
const DEFAULT_BASE_CURRENCY = "ILS";

export type CurrentWorkspaceContext = {
  userId: string;
  workspaceId: string;
  memberId: string;
  baseCurrency: string;
};

export async function resolveCurrentWorkspaceContext(): Promise<CurrentWorkspaceContext> {
  if (getFinappAuthMode() === "supabase") {
    return resolveSupabaseWorkspaceContext();
  }

  return resolveSeededDevWorkspaceContext();
}

export async function runWithWorkspaceDatabaseUser<T>(
  context: CurrentWorkspaceContext,
  callback: () => Promise<T>,
) {
  if (getFinappAuthMode() !== "supabase") {
    return callback();
  }

  return runWithDatabaseUser(context.userId, callback);
}

async function resolveSeededDevWorkspaceContext(): Promise<CurrentWorkspaceContext> {
  const db = getDb();

  return db.transaction(async (tx) => {
    // Serialize the dev bootstrap path so concurrent first-load requests do not race
    // into duplicate inserts for the seeded user/workspace/member records.
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);

    let user = await tx.query.users.findFirst({
      where: eq(users.email, DEFAULT_USER_EMAIL),
    });

    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          email: DEFAULT_USER_EMAIL,
          displayName: DEFAULT_USER_NAME,
        })
        .returning();
    }

    const existingMember = await tx.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.userId, user.id),
    });

    if (existingMember) {
      const workspace = await tx.query.workspaces.findFirst({
        where: eq(workspaces.id, existingMember.workspaceId),
      });

      if (!workspace) {
        throw new Error("Seeded workspace member exists without a workspace");
      }

      return {
        userId: user.id,
        workspaceId: workspace.id,
        memberId: existingMember.id,
        baseCurrency: workspace.baseCurrency,
      };
    }

    let workspace = await tx.query.workspaces.findFirst({
      where: eq(workspaces.name, DEFAULT_WORKSPACE_NAME),
    });

    if (!workspace) {
      [workspace] = await tx
        .insert(workspaces)
        .values({
          name: DEFAULT_WORKSPACE_NAME,
          baseCurrency: DEFAULT_BASE_CURRENCY,
        })
        .returning();
    }

    let member = await tx.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, user.id),
      ),
    });

    if (!member) {
      [member] = await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: workspace.id,
          userId: user.id,
          role: DEFAULT_MEMBER_ROLE,
        })
        .returning();
    }

    return {
      userId: user.id,
      workspaceId: workspace.id,
      memberId: member.id,
      baseCurrency: workspace.baseCurrency,
    };
  });
}

async function resolveSupabaseWorkspaceContext(): Promise<CurrentWorkspaceContext> {
  const authUser = await getSupabaseAuthenticatedUser();

  if (!authUser) {
    redirect("/sign-in");
  }

  const db = getDb();
  const email = authUser.email ?? `${authUser.id}@supabase.local`;
  const displayName =
    typeof authUser.user_metadata?.name === "string"
      ? authUser.user_metadata.name
      : typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : email.split("@")[0] || "Finance user";

  const context = await runWithDatabaseUser(authUser.id, () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authUser.id}))`);

      let user = await tx.query.users.findFirst({
        where: eq(users.id, authUser.id),
      });

      if (!user) {
        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: authUser.id,
            email,
            displayName,
          })
          .onConflictDoNothing({
            target: users.id,
          })
          .returning();

        user =
          insertedUser
          ?? await tx.query.users.findFirst({
            where: eq(users.id, authUser.id),
          });
      }

      if (!user) {
        throw new Error("Could not create or load the authenticated app user.");
      }

      const member = await tx.query.workspaceMembers.findFirst({
        where: and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)),
      });

      if (!member) {
        return null;
      }

      const workspace = await tx.query.workspaces.findFirst({
        where: eq(workspaces.id, member.workspaceId),
      });

      if (!workspace) {
        throw new Error("Workspace member exists without a workspace.");
      }

      return {
        userId: user.id,
        workspaceId: workspace.id,
        memberId: member.id,
        baseCurrency: workspace.baseCurrency,
      };
    }),
  );

  if (!context) {
    redirect("/onboarding");
  }

  // Keep the authenticated database user bound for downstream workspace queries
  // in the same page/API request. RLS depends on app.current_user_id for reads.
  setCurrentDatabaseUserId(authUser.id);

  return context;
}
