import { redirect } from "next/navigation";

import { getSupabaseAuthContext } from "@/features/auth/supabase-user";

type MfaPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function getSafeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const params = await searchParams;
  const next = getSafeNext(params?.next);
  const user = await getSupabaseAuthContext();

  if (!user) {
    redirect("/sign-in");
  }

  redirect(next);
}
