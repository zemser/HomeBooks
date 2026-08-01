"use server";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { runWithDatabaseUser } from "@/db/request-context";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { getSupabaseAuthenticatedUser } from "@/features/auth/supabase-user";
import { seedStarterWorkspaceCategories } from "@/features/workspaces/categories";

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

  await runWithDatabaseUser(authUser.id, () =>
    db.transaction(async (tx) => {
      // Establish the RLS identity on this transaction before the first
      // protected read or insert. This is the first database request for a
      // hosted user, so it must not depend on a later query hook.
      await tx.execute(
        sql`select set_config('app.current_user_id', ${authUser.id}, false)`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authUser.id}))`);

      let user = await tx.query.users.findFirst({
        where: eq(users.id, authUser.id),
      });

      if (!user) {
        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: authUser.id,
            email: authUser.email ?? `${authUser.id}@supabase.local`,
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

      await seedStarterWorkspaceCategories(workspaceId, tx);

      await tx.insert(workspaceMembers).values({
        workspaceId,
        userId: user.id,
        role: "owner",
        displayNameOverride: displayName,
      });
    }),
  );

  redirect("/");
}
