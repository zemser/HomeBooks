"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

function getPasswordValidationError(password: string) {
  if (password.length < 10) {
    return "Password must be at least 10 characters.";
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
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
  const confirmPassword = getString(formData, "confirmPassword");
  const displayName = getString(formData, "displayName");

  if (!displayName) {
    redirectWithError("/sign-in", "Display name is required.");
  }

  if (!email || !password || !confirmPassword) {
    redirectWithError("/sign-in", "Email, password, and password confirmation are required.");
  }

  if (password !== confirmPassword) {
    redirectWithError("/sign-in", "Passwords do not match.");
  }

  const passwordError = getPasswordValidationError(password);

  if (passwordError) {
    redirectWithError("/sign-in", passwordError);
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
    redirectWithError("/sign-in", error.message);
  }

  redirect("/onboarding");
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = getSafeNext(formData);
  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (!origin) {
    redirectWithError("/sign-in", "Could not start Google sign-in.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirectWithError("/sign-in", error?.message ?? "Could not start Google sign-in.");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
