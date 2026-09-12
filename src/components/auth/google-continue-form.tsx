import { signInWithGoogleAction } from "@/features/auth/actions";
import { GoogleMark } from "@/components/auth/google-mark";

type GoogleContinueFormProps = {
  from: "sign-in" | "sign-up";
  next?: string;
};

export function GoogleContinueForm({
  from,
  next = "/",
}: GoogleContinueFormProps) {
  return (
    <form action={signInWithGoogleAction} className="auth-google-form">
      <input name="from" type="hidden" value={from} />
      <input name="next" type="hidden" value={next} />
      <button className="button google-button auth-button" type="submit">
        <GoogleMark />
        Continue with Google
      </button>
    </form>
  );
}
