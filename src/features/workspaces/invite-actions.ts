"use server";

import { redirect } from "next/navigation";

import { withDbTransaction } from "@/db";
import { AuthContextError, requireAal2Context } from "@/features/auth/supabase-user";
import {
  displayNameFromAuth,
  ensureAppUser,
} from "@/features/workspaces/app-user";
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
} from "@/features/workspaces/invites";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isNextRedirect(error: unknown) {
  return (
    typeof error === "object"
    && error !== null
    && "digest" in error
    && typeof error.digest === "string"
    && error.digest.startsWith("NEXT_REDIRECT")
  );
}

function redirectOnboardingError(message: string): never {
  redirect(`/onboarding?error=${encodeURIComponent(message)}`);
}

export async function acceptWorkspaceInviteAction(formData: FormData) {
  const inviteId = getString(formData, "inviteId");

  if (!inviteId) {
    redirectOnboardingError("This invite is no longer available.");
  }

  const authUser = await requireAal2Context();

  try {
    await withDbTransaction(authUser.userId, async (tx) => {
      const user = await ensureAppUser(tx, authUser);
      await acceptWorkspaceInvite(
        tx,
        {
          userId: user.id,
          email: user.email,
          displayName: displayNameFromAuth(authUser, user.displayName),
        },
        inviteId,
      );
    });
  } catch (error) {
    if (isNextRedirect(error) || error instanceof AuthContextError) {
      throw error;
    }

    redirectOnboardingError(
      error instanceof Error ? error.message : "Could not accept the invite.",
    );
  }

  redirect("/");
}

export async function declineWorkspaceInviteAction(formData: FormData) {
  const inviteId = getString(formData, "inviteId");

  if (!inviteId) {
    redirectOnboardingError("This invite is no longer available.");
  }

  const authUser = await requireAal2Context();

  try {
    await withDbTransaction(authUser.userId, async (tx) => {
      const user = await ensureAppUser(tx, authUser);
      await declineWorkspaceInvite(tx, user.email, inviteId);
    });
  } catch (error) {
    if (isNextRedirect(error) || error instanceof AuthContextError) {
      throw error;
    }

    redirectOnboardingError(
      error instanceof Error ? error.message : "Could not decline the invite.",
    );
  }

  redirect("/onboarding");
}
