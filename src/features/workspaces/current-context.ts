import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { users, workspaceMembers, workspaces } from "@/db/schema";

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
