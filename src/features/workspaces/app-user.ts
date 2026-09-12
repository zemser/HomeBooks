import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { users } from "@/db/schema";
import type { VerifiedAuthContext } from "@/features/auth/supabase-user";

export function displayNameFromAuth(
  authUser: Pick<VerifiedAuthContext, "email" | "userMetadata">,
  fallback = "Finance user",
) {
  const named =
    typeof authUser.userMetadata?.name === "string" ? authUser.userMetadata.name.trim() : "";

  return named || authUser.email?.split("@")[0]?.trim() || fallback;
}

export function emailFromAuth(authUser: Pick<VerifiedAuthContext, "userId" | "email">) {
  const email = authUser.email?.trim().toLowerCase();
  return email || `${authUser.userId}@supabase.local`;
}

export async function ensureAppUser(
  db: DbExecutor,
  authUser: Pick<VerifiedAuthContext, "userId" | "email" | "userMetadata">,
  displayName?: string,
) {
  const existing = await db.query.users.findFirst({
    where: eq(users.id, authUser.userId),
  });

  if (existing) {
    return existing;
  }

  const [inserted] = await db
    .insert(users)
    .values({
      id: authUser.userId,
      email: emailFromAuth(authUser),
      displayName: displayName?.trim() || displayNameFromAuth(authUser),
    })
    .onConflictDoNothing({
      target: users.id,
    })
    .returning();

  const user =
    inserted
    ?? await db.query.users.findFirst({
      where: eq(users.id, authUser.userId),
    });

  if (!user) {
    throw new Error("Could not create or load the authenticated app user.");
  }

  return user;
}
