"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { displayNameFromEmail, getPasswordValidationError } from "@/features/auth/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(pathname: string, message: string): never {
  const params = new URLSearchParams({
    error: message,
  });
  redirect(`${pathname}?${params.toString()}`);
}

function getSafeNext(formData: FormData) {
  const next = getString(formData, "next");

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function getGoogleErrorPath(formData: FormData) {
  return getString(formData, "from") === "sign-up" ? "/sign-up" : "/sign-in";
}

export async function signInWithPasswordAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getSafeNext(formData);

  if (!email || !password) {
    redirectWithError("/sign-in", "Email and password are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirectWithError("/sign-in", error.message);
  }

  redirect(next);
}

export async function signUpWithPasswordAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const displayName = displayNameFromEmail(email);

  if (!email || !password) {
    redirectWithError("/sign-up", "Email and password are required.");
  }

  const passwordError = getPasswordValidationError(password);

  if (passwordError) {
    redirectWithError("/sign-up", passwordError);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: displayName,
        name: displayName,
      },
    },
  });

  if (error) {
    redirectWithError("/sign-up", error.message);
  }

  redirect("/onboarding");
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = getSafeNext(formData);
  const errorPath = getGoogleErrorPath(formData);
  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (!origin) {
    redirectWithError(errorPath, "Could not start Google sign-in.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirectWithError(errorPath, error?.message ?? "Could not start Google sign-in.");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
