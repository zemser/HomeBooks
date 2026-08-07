"use server";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { runWithDatabaseUser } from "@/db/request-context";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { requireAal2Context } from "@/features/auth/supabase-user";
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
    || (typeof authUser.userMetadata?.name === "string" ? authUser.userMetadata.name : "")
    || authUser.email?.split("@")[0]
    || "Finance user";
  const baseCurrency = (getString(formData, "baseCurrency") || "ILS").toUpperCase();

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    redirect("/onboarding?error=Base%20currency%20must%20be%20a%203-letter%20code.");
  }

  const db = getDb();

  await runWithDatabaseUser(authUser.userId, () =>
    db.transaction(async (tx) => {
      // Establish the RLS identity on this transaction before the first
      // protected read or insert. This is the first database request for a
      // hosted user, so it must not depend on a later query hook.
      await tx.execute(
        sql`select set_config('app.current_user_id', ${authUser.userId}, false)`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authUser.userId}))`);

      let user = await tx.query.users.findFirst({
        where: eq(users.id, authUser.userId),
      });

      if (!user) {
        const [insertedUser] = await tx
          .insert(users)
          .values({
            id: authUser.userId,
            email: authUser.email ?? `${authUser.userId}@supabase.local`,
            displayName,
          })
          .onConflictDoNothing({
            target: users.id,
          })
          .returning();

        user =
          insertedUser
          ?? await tx.query.users.findFirst({
        where: eq(users.id, authUser.userId),
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
