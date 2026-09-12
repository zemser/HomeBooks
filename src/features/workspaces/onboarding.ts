"use server";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { withDbTransaction } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { requireAal2Context } from "@/features/auth/supabase-user";
import { displayNameFromAuth, ensureAppUser } from "@/features/workspaces/app-user";
import { seedStarterWorkspaceCategories } from "@/features/workspaces/categories";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createFirstWorkspaceAction(formData: FormData) {
  const authUser = await requireAal2Context();

  const workspaceName = getString(formData, "workspaceName") || "Household Workspace";
  const displayName =
    getString(formData, "displayName")
    || displayNameFromAuth(authUser);
  const baseCurrency = (getString(formData, "baseCurrency") || "ILS").toUpperCase();

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    redirect("/onboarding?error=Base%20currency%20must%20be%20a%203-letter%20code.");
  }

  await withDbTransaction(authUser.userId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authUser.userId}))`);

      const user = await ensureAppUser(tx, authUser, displayName);

      const existingMember = await tx.query.workspaceMembers.findFirst({
        where: (members, { and, eq }) => and(
          eq(members.userId, user.id),
          eq(members.isActive, true),
        ),
      });

      if (existingMember) {
        // Repeated submissions are safe: an already completed onboarding
        // command does not create another workspace or membership.
        return;
      }

      const workspaceId = randomUUID();

      await tx
        .insert(workspaces)
        .values({
          id: workspaceId,
          name: workspaceName,
          baseCurrency,
        });

      await seedStarterWorkspaceCategories(workspaceId, tx);

      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId,
          userId: user.id,
          role: "owner",
          displayNameOverride: displayName,
        })
        .onConflictDoNothing({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        });
  });

  redirect("/");
}
