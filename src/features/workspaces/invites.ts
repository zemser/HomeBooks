import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import { users, workspaceInvites, workspaceMembers } from "@/db/schema";
import type { AuthenticatedRequestContext } from "@/features/workspaces/current-context";
import {
  WORKSPACE_INVITE_STATUSES,
  WORKSPACE_MEMBER_ROLES,
  type WorkspaceInviteItem,
  type WorkspaceInviteStatus,
  type WorkspaceMemberRole,
} from "@/features/workspaces/types";

const INVITE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInviteEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!INVITE_EMAIL_PATTERN.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (email.endsWith("@placeholder.finapp.local") || email.endsWith("@supabase.local")) {
    throw new Error("Enter a real email address.");
  }

  return email;
}

function normalizeStoredEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRole(value: string): WorkspaceMemberRole {
  if (WORKSPACE_MEMBER_ROLES.includes(value as WorkspaceMemberRole)) {
    return value as WorkspaceMemberRole;
  }

  throw new Error("Workspace member role must be owner or member.");
}

function normalizeInviteStatus(value: string): WorkspaceInviteStatus {
  if (WORKSPACE_INVITE_STATUSES.includes(value as WorkspaceInviteStatus)) {
    return value as WorkspaceInviteStatus;
  }

  throw new Error("Invite status is invalid.");
}

function toInviteItem(row: {
  id: string;
  invitedEmail: string;
  role: string;
  status: string;
  workspaceNameSnapshot: string;
  invitedByDisplayName: string;
}): WorkspaceInviteItem {
  return {
    id: row.id,
    invitedEmail: row.invitedEmail,
    role: normalizeRole(row.role),
    status: normalizeInviteStatus(row.status),
    workspaceName: row.workspaceNameSnapshot,
    invitedByDisplayName: row.invitedByDisplayName,
  };
}

function assertOwner(context: AuthenticatedRequestContext) {
  if (context.membership.role !== "owner") {
    throw new Error("Only workspace owners can invite people.");
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function listWorkspaceInvites(
  context: AuthenticatedRequestContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceInviteItem[]> {
  const rows = await db
    .select({
      id: workspaceInvites.id,
      invitedEmail: workspaceInvites.invitedEmail,
      role: workspaceInvites.role,
      status: workspaceInvites.status,
      workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
      invitedByDisplayName: workspaceInvites.invitedByDisplayName,
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, context.workspaceId),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .orderBy(desc(workspaceInvites.createdAt));

  return rows.map(toInviteItem);
}

export async function listPendingInvitesForEmail(
  db: DbExecutor,
  email: string,
): Promise<WorkspaceInviteItem[]> {
  const invitedEmail = normalizeStoredEmail(email);

  if (!invitedEmail) {
    return [];
  }

  const rows = await db
    .select({
      id: workspaceInvites.id,
      invitedEmail: workspaceInvites.invitedEmail,
      role: workspaceInvites.role,
      status: workspaceInvites.status,
      workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
      invitedByDisplayName: workspaceInvites.invitedByDisplayName,
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.invitedEmail, invitedEmail),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .orderBy(desc(workspaceInvites.createdAt));

  return rows.map(toInviteItem);
}

export async function createWorkspaceInvite(
  context: AuthenticatedRequestContext,
  db: DbExecutor = getDb(),
  input: {
    email: string;
  },
) {
  assertOwner(context);

  const invitedEmail = normalizeInviteEmail(input.email);
  const inviterEmail = normalizeStoredEmail(context.appUser.email);

  if (invitedEmail === inviterEmail) {
    throw new Error("You already belong to this workspace.");
  }

  const [existingMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        sql`lower(${users.email}) = ${invitedEmail}`,
      ),
    );

  if (existingMember) {
    throw new Error("That person already belongs to this workspace.");
  }

  const invitedByDisplayName =
    context.membership.displayNameOverride?.trim() || context.appUser.displayName;

  try {
    const [created] = await db
      .insert(workspaceInvites)
      .values({
        workspaceId: context.workspaceId,
        invitedEmail,
        invitedByUserId: context.userId,
        role: "member",
        status: "pending",
        workspaceNameSnapshot: context.workspace.name,
        invitedByDisplayName,
      })
      .returning({
        id: workspaceInvites.id,
        invitedEmail: workspaceInvites.invitedEmail,
        role: workspaceInvites.role,
        status: workspaceInvites.status,
        workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
        invitedByDisplayName: workspaceInvites.invitedByDisplayName,
      });

    return toInviteItem(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("That email already has a pending invite.");
    }

    throw error;
  }
}

export async function revokeWorkspaceInvite(
  context: AuthenticatedRequestContext,
  db: DbExecutor = getDb(),
  inviteId: string,
) {
  assertOwner(context);

  const [updated] = await db
    .update(workspaceInvites)
    .set({
      status: "revoked",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, context.workspaceId),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .returning({
      id: workspaceInvites.id,
      invitedEmail: workspaceInvites.invitedEmail,
      role: workspaceInvites.role,
      status: workspaceInvites.status,
      workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
      invitedByDisplayName: workspaceInvites.invitedByDisplayName,
    });

  if (!updated) {
    throw new Error("This invite is no longer available.");
  }

  return toInviteItem(updated);
}

export async function acceptWorkspaceInvite(
  db: DbExecutor,
  input: {
    userId: string;
    email: string;
    displayName: string;
  },
  inviteId: string,
) {
  const email = normalizeStoredEmail(input.email);
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, inviteId),
  });

  if (!invite || invite.status !== "pending") {
    throw new Error("This invite is no longer available.");
  }

  if (invite.invitedEmail !== email) {
    throw new Error("This invite was sent to a different email address.");
  }

  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, invite.workspaceId),
      eq(workspaceMembers.userId, input.userId),
    ),
  });

  if (existing?.isActive) {
    throw new Error("You already belong to this workspace.");
  }

  if (existing) {
    await db
      .update(workspaceMembers)
      .set({
        isActive: true,
        role: normalizeRole(invite.role),
        updatedAt: new Date(),
      })
      .where(eq(workspaceMembers.id, existing.id));
  } else {
    await db.insert(workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId: input.userId,
      role: normalizeRole(invite.role),
      displayNameOverride: input.displayName,
    });
  }

  const [updated] = await db
    .update(workspaceInvites)
    .set({
      status: "accepted",
      acceptedByUserId: input.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceInvites.id, invite.id),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .returning({
      id: workspaceInvites.id,
      invitedEmail: workspaceInvites.invitedEmail,
      role: workspaceInvites.role,
      status: workspaceInvites.status,
      workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
      invitedByDisplayName: workspaceInvites.invitedByDisplayName,
    });

  if (!updated) {
    throw new Error("This invite is no longer available.");
  }

  return toInviteItem(updated);
}

export async function declineWorkspaceInvite(
  db: DbExecutor,
  email: string,
  inviteId: string,
) {
  const invitedEmail = normalizeStoredEmail(email);
  const [updated] = await db
    .update(workspaceInvites)
    .set({
      status: "declined",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.invitedEmail, invitedEmail),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .returning({
      id: workspaceInvites.id,
      invitedEmail: workspaceInvites.invitedEmail,
      role: workspaceInvites.role,
      status: workspaceInvites.status,
      workspaceNameSnapshot: workspaceInvites.workspaceNameSnapshot,
      invitedByDisplayName: workspaceInvites.invitedByDisplayName,
    });

  if (!updated) {
    throw new Error("This invite is no longer available.");
  }

  return toInviteItem(updated);
}
