"use server";

import { redirect } from "next/navigation";

import { getSupabaseAuthContext } from "@/features/auth/supabase-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MfaEnrollmentState =
  | {
      status: "idle";
      error?: undefined;
      factorId?: undefined;
      challengeId?: undefined;
      qrCode?: undefined;
      secret?: undefined;
    }
  | {
      status: "ready";
      factorId: string;
      challengeId: string;
      qrCode: string;
      secret: string;
      error?: undefined;
    }
  | {
      status: "error";
      error: string;
      factorId?: undefined;
      challengeId?: undefined;
      qrCode?: undefined;
      secret?: undefined;
    };

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getSafeNext(formData: FormData) {
  const next = getString(formData, "next");

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function redirectWithMfaError(message: string, next: string) {
  const params = new URLSearchParams({
    error: message,
    next,
  });

  redirect(`/mfa?${params.toString()}`);
}

export async function beginTotpEnrollmentAction(
  _previousState: MfaEnrollmentState,
): Promise<MfaEnrollmentState> {
  void _previousState;

  const user = await getSupabaseAuthContext();

  if (!user) {
    redirect("/sign-in");
  }

  const supabase = await createSupabaseServerClient();
  const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Fin App authenticator",
    issuer: "Fin App",
  });

  if (enrollError) {
    return {
      status: "error",
      error: enrollError.message,
    };
  }

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: enrollData.id,
  });

  if (challengeError) {
    await supabase.auth.mfa.unenroll({ factorId: enrollData.id });

    return {
      status: "error",
      error: challengeError.message,
    };
  }

  return {
    status: "ready",
    factorId: enrollData.id,
    challengeId: challengeData.id,
    qrCode: enrollData.totp.qr_code,
    secret: enrollData.totp.secret,
  };
}

export async function verifyTotpEnrollmentAction(formData: FormData) {
  const factorId = getString(formData, "factorId");
  const challengeId = getString(formData, "challengeId");
  const code = getString(formData, "code");
  const next = getSafeNext(formData);

  if (!factorId || !challengeId || !code) {
    redirectWithMfaError("Authenticator factor, challenge, and code are required.", next);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code,
  });

  if (error) {
    redirectWithMfaError(error.message, next);
  }

  redirect(next);
}

export async function verifyExistingTotpAction(formData: FormData) {
  const factorId = getString(formData, "factorId");
  const code = getString(formData, "code");
  const next = getSafeNext(formData);

  if (!factorId || !code) {
    redirectWithMfaError("Authenticator factor and code are required.", next);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });

  if (error) {
    redirectWithMfaError(error.message, next);
  }

  redirect(next);
}
