import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { runWithDatabaseUser } from "@/db/request-context";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import {
  AuthContextError,
  requireAal2Context,
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

export async function withCurrentWorkspace<T>(
  callback: (context: CurrentWorkspaceContext) => Promise<T>,
) {
  const requestId = (await headers()).get("x-request-id") ?? undefined;
  return withTelemetryOperation({ operation: "workspace.request", requestId }, async () => {
    const context = await withTelemetrySpan("workspace.context", async () => {
      recordWorkspaceLookup();
      return resolveCurrentWorkspaceContext();
    });

    return runWithWorkspaceDatabaseUser(context, () => callback(context));
  });
}

async function resolveSeededDevWorkspaceContext(): Promise<CurrentWorkspaceContext> {
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

    return {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      memberId: existingMember.id,
      baseCurrency: workspace.baseCurrency,
    };
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

      return {
        userId: user.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
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

    return {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      memberId: member.id,
      baseCurrency: workspace.baseCurrency,
    };
  });
}

async function resolveSupabaseWorkspaceContext(): Promise<CurrentWorkspaceContext> {
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
  const email = authContext.email ?? `${authContext.userId}@supabase.local`;
  const displayName =
    typeof authContext.userMetadata?.name === "string"
      ? authContext.userMetadata.name
      : typeof authContext.userMetadata?.full_name === "string"
        ? authContext.userMetadata.full_name
        : email.split("@")[0] || "Finance user";

  const fastPath = await runWithDatabaseUser(authContext.userId, () =>
    db.transaction(async (tx) => {
      await establishRlsIdentity(tx, authContext.userId);

      const user = await tx.query.users.findFirst({
        where: eq(users.id, authContext.userId),
      });

      if (!user) return { needsBootstrap: true, context: null };

      return {
        needsBootstrap: false,
        context: await loadWorkspaceContext(tx, user.id),
      };
    }),
  );

  if (!fastPath.needsBootstrap) {
    if (!fastPath.context) redirect("/onboarding");
    return fastPath.context;
  }

  const context = await runWithDatabaseUser(authContext.userId, () =>
    db.transaction(async (tx) => {
      // Only the missing-user bootstrap is serialized. The fast path above
      // handles every established user and onboarding user without a lock.
      await establishRlsIdentity(tx, authContext.userId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authContext.userId}))`);

      let user = await tx.query.users.findFirst({
        where: eq(users.id, authContext.userId),
      });

      if (!user) {
        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: authContext.userId,
            email,
            displayName,
          })
          .onConflictDoNothing({ target: users.id })
          .returning();

        user = insertedUser ?? await tx.query.users.findFirst({
          where: eq(users.id, authContext.userId),
        });
      }

      if (!user) {
        throw new Error("Could not create or load the authenticated app user.");
      }

      return loadWorkspaceContext(tx, user.id);
    }),
  );

  if (!context) {
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
  userId: string,
): Promise<CurrentWorkspaceContext | null> {
  const member = await tx.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.isActive, true)),
  });

  if (!member) return null;

  const workspace = await tx.query.workspaces.findFirst({
    where: eq(workspaces.id, member.workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace member exists without a workspace.");
  }

  return {
    userId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    memberId: member.id,
    baseCurrency: workspace.baseCurrency,
  };
}
