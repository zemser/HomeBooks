import { redirect } from "next/navigation";

/** Keep old bookmarks working after retiring the authenticator step. */
export default function MfaPage() {
  redirect("/");
}
