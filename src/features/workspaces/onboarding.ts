"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createFirstWorkspaceAction(formData: FormData) {
  const authUser = await getSupabaseAuthenticatedUser();

  if (!authUser) {
    redirect("/sign-in");
  }

  const workspaceName = getString(formData, "workspaceName") || "Household Workspace";
  const displayName =
    getString(formData, "displayName")
    || (typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : "")
    || authUser.email?.split("@")[0]
    || "Finance user";
  const baseCurrency = (getString(formData, "baseCurrency") || "ILS").toUpperCase();

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    redirect("/onboarding?error=Base%20currency%20must%20be%20a%203-letter%20code.");
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({
      where: eq(users.id, authUser.id),
    });

    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          id: authUser.id,
          email: authUser.email ?? `${authUser.id}@supabase.local`,
          displayName,
        })
        .returning();
    }

    const existingMember = await tx.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.userId, user.id),
    });

    if (existingMember) {
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

    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: "owner",
      displayNameOverride: displayName,
    });
  });

  redirect("/");
}
