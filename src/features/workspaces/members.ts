import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users, workspaceMembers } from "@/db/schema";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";

function normalizeDisplayName(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error("Display name is required.");
  }

  return normalized;
}

function toSettingsItem(row: {
  id: string;
  displayNameOverride: string | null;
  userDisplayName: string;
  isActive: boolean;
  role: string;
}) {
  return {
    id: row.id,
    displayName: row.displayNameOverride?.trim() || row.userDisplayName,
    displayNameOverride: row.displayNameOverride?.trim() || null,
    userDisplayName: row.userDisplayName,
    isActive: row.isActive,
    role: row.role,
  } satisfies WorkspaceMemberSettingsItem;
}

export async function listWorkspaceMembersForSettings(
  context: CurrentWorkspaceContext,
): Promise<WorkspaceMemberSettingsItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: workspaceMembers.id,
      displayNameOverride: workspaceMembers.displayNameOverride,
      userDisplayName: users.displayName,
      isActive: workspaceMembers.isActive,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, context.workspaceId))
    .orderBy(
      asc(workspaceMembers.isActive),
      asc(workspaceMembers.createdAt),
    );

  return rows
    .map(toSettingsItem)
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName);
    });
}

export async function createWorkspaceMember(
  context: CurrentWorkspaceContext,
  input: {
    displayName: string;
  },
) {
  const db = getDb();
  const displayName = normalizeDisplayName(input.displayName);

  return db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        email: `member-${randomUUID()}@placeholder.finapp.local`,
        displayName,
      })
      .returning({
        id: users.id,
        displayName: users.displayName,
      });

    const [createdMember] = await tx
      .insert(workspaceMembers)
      .values({
        workspaceId: context.workspaceId,
        userId: createdUser.id,
        role: "member",
        displayNameOverride: null,
        isActive: true,
      })
      .returning({
        id: workspaceMembers.id,
        displayNameOverride: workspaceMembers.displayNameOverride,
        isActive: workspaceMembers.isActive,
        role: workspaceMembers.role,
      });

    return toSettingsItem({
      ...createdMember,
      userDisplayName: createdUser.displayName,
    });
  });
}

export async function updateWorkspaceMember(
  context: CurrentWorkspaceContext,
  memberId: string,
  input: {
    displayName?: string | null;
    isActive?: boolean;
  },
) {
  const db = getDb();
  const existing = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      isActive: workspaceMembers.isActive,
      displayNameOverride: workspaceMembers.displayNameOverride,
      userDisplayName: users.displayName,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, context.workspaceId),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (!existing) {
    throw new Error("Workspace member was not found.");
  }

  const nextDisplayNameOverride =
    input.displayName === undefined
      ? existing.displayNameOverride
      : normalizeDisplayName(input.displayName) === existing.userDisplayName
        ? null
        : normalizeDisplayName(input.displayName);

  const [updatedMember] = await db
    .update(workspaceMembers)
    .set({
      displayNameOverride: nextDisplayNameOverride,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(workspaceMembers.id, existing.id))
    .returning({
      id: workspaceMembers.id,
      displayNameOverride: workspaceMembers.displayNameOverride,
      isActive: workspaceMembers.isActive,
      role: workspaceMembers.role,
    });

  return toSettingsItem({
    ...updatedMember,
    userDisplayName: existing.userDisplayName,
  });
}
