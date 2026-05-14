"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(pathname: string, message: string) {
  const params = new URLSearchParams({
    error: message,
  });
  redirect(`${pathname}?${params.toString()}`);
}

export async function signInWithPasswordAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getString(formData, "next") || "/";

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

  redirect(next.startsWith("/") ? next : "/");
}

export async function signUpWithPasswordAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const displayName = getString(formData, "displayName");

  if (!email || !password) {
    redirectWithError("/sign-in", "Email and password are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: displayName || email.split("@")[0],
      },
    },
  });

  if (error) {
    redirectWithError("/sign-in", error.message);
  }

  redirect("/onboarding");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
