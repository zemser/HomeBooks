import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/db";
import { runWithDatabaseUser } from "@/db/request-context";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import {
  AuthContextError,
  requireAal2Context,
  type VerifiedAuthContext,
} from "@/features/auth/supabase-user";
import { seedStarterWorkspaceCategories } from "@/features/workspaces/categories";
import { getFinappAuthMode } from "@/lib/supabase/config";
import {
  recordRlsSetup,
  recordWorkspaceLookup,
  withTelemetryOperation,
  withTelemetrySpan,
} from "@/lib/telemetry/server";

const DEFAULT_USER_EMAIL = "dev@finapp.local";
const DEFAULT_USER_NAME = "Dev User";
const DEFAULT_WORKSPACE_NAME = "Household Workspace";
const DEFAULT_MEMBER_ROLE = "owner";
const DEFAULT_BASE_CURRENCY = "ILS";

export type CurrentWorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspaceName?: string;
  memberId: string;
  baseCurrency: string;
};

export type AuthenticatedRequestContext = CurrentWorkspaceContext & {
  verifiedSubject: string;
  aal: VerifiedAuthContext["aal"];
  appUser: typeof users.$inferSelect;
  membership: typeof workspaceMembers.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
};

/**
 * React cache is request-scoped when called during a Server Component render;
 * it is not a process-wide user or workspace cache. Route Handlers and Actions
 * call this once at their entry point and pass the result to their services.
 */
export const resolveAuthenticatedRequestContext = cache(async function resolveAuthenticatedRequestContext(): Promise<AuthenticatedRequestContext> {
  if (getFinappAuthMode() === "supabase") {
    return resolveSupabaseRequestContext();
  }

  return resolveSeededDevWorkspaceContext();
});

/** Compatibility resolver for callers that only need the legacy workspace shape. */
export async function resolveCurrentWorkspaceContext(): Promise<AuthenticatedRequestContext> {
  return resolveAuthenticatedRequestContext();
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

export async function withCurrentWorkspace<T>(
  callback: (context: AuthenticatedRequestContext) => Promise<T>,
) {
  const requestId = (await headers()).get("x-request-id") ?? undefined;
  return withTelemetryOperation({ operation: "workspace.request", requestId }, async () => {
    const context = await withTelemetrySpan("workspace.context", async () => {
      recordWorkspaceLookup();
      return resolveAuthenticatedRequestContext();
    });

    return runWithWorkspaceDatabaseUser(context, () => callback(context));
  });
}

async function resolveSeededDevWorkspaceContext(): Promise<AuthenticatedRequestContext> {
  const db = getDb();

  const existingContext = await db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({
      where: eq(users.email, DEFAULT_USER_EMAIL),
    });

    if (!user) return null;

    const existingMember = await tx.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)),
    });

    if (!existingMember) return null;

    const workspace = await tx.query.workspaces.findFirst({
      where: eq(workspaces.id, existingMember.workspaceId),
    });

    if (!workspace) {
      throw new Error("Seeded workspace member exists without a workspace");
    }

    return createAuthenticatedRequestContext(
      { userId: user.id, aal: "aal2" },
      user,
      existingMember,
      workspace,
    );
  });

  if (existingContext) return existingContext;

  return db.transaction(async (tx) => {
    // Only the first-user bootstrap needs serialization. Established seeded
    // requests return from the read-only fast path above.
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
      where: and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)),
    });

    if (existingMember) {
      const workspace = await tx.query.workspaces.findFirst({
        where: eq(workspaces.id, existingMember.workspaceId),
      });

      if (!workspace) {
        throw new Error("Seeded workspace member exists without a workspace");
      }

      return createAuthenticatedRequestContext(
        { userId: user.id, aal: "aal2" },
        user,
        existingMember,
        workspace,
      );
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

      await seedStarterWorkspaceCategories(workspace.id, tx);
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

    return createAuthenticatedRequestContext(
      { userId: user.id, aal: "aal2" },
      user,
      member,
      workspace,
    );
  });
}

async function resolveSupabaseRequestContext(): Promise<AuthenticatedRequestContext> {
  let authContext;
  try {
    authContext = await requireAal2Context();
  } catch (error) {
    if (error instanceof AuthContextError) {
      redirect(error.status === 401 ? "/sign-in" : "/mfa");
    }
    throw error;
  }

  const db = getDb();
  const context = await runWithDatabaseUser(authContext.userId, () =>
    db.transaction(async (tx) => {
      await establishRlsIdentity(tx, authContext.userId);

      const user = await tx.query.users.findFirst({
        where: eq(users.id, authContext.userId),
      });

      return user ? await loadWorkspaceContext(tx, authContext, user) : null;
    }),
  );

  if (!context) {
    // Bootstrap is an onboarding command, never a side effect of an ordinary
    // page or API read. This also makes partial legacy state visible and
    // recoverable instead of repairing it on every request.
    redirect("/onboarding");
  }

  return context;
}

type WorkspaceTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function establishRlsIdentity(tx: WorkspaceTransaction, userId: string) {
  recordRlsSetup();
  await tx.execute(sql`select set_config('app.current_user_id', ${userId}, false)`);
}

async function loadWorkspaceContext(
  tx: WorkspaceTransaction,
  authContext: Pick<VerifiedAuthContext, "userId" | "aal">,
  user: typeof users.$inferSelect,
): Promise<AuthenticatedRequestContext | null> {
  const member = await tx.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)),
  });

  if (!member) return null;

  const workspace = await tx.query.workspaces.findFirst({
    where: eq(workspaces.id, member.workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace member exists without a workspace.");
  }

  return createAuthenticatedRequestContext(authContext, user, member, workspace);
}

function createAuthenticatedRequestContext(
  authContext: Pick<VerifiedAuthContext, "userId" | "aal">,
  appUser: typeof users.$inferSelect,
  membership: typeof workspaceMembers.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
): AuthenticatedRequestContext {
  return {
    verifiedSubject: authContext.userId,
    aal: authContext.aal,
    appUser,
    membership,
    workspace,
    userId: appUser.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    memberId: membership.id,
    baseCurrency: workspace.baseCurrency,
  };
}
