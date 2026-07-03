"use client";

import { useActionState } from "react";

import {
  beginTotpEnrollmentAction,
  verifyTotpEnrollmentAction,
  type MfaEnrollmentState,
} from "@/features/auth/mfa-actions";

const INITIAL_STATE: MfaEnrollmentState = {
  status: "idle",
};

export function MfaEnrollmentClient({ next }: { next: string }) {
  const [state, beginAction, pending] = useActionState(
    beginTotpEnrollmentAction,
    INITIAL_STATE,
  );

  if (state.status === "ready") {
    const qrCodeSrc = state.qrCode.startsWith("data:")
      ? state.qrCode
      : `data:image/svg+xml;utf8,${encodeURIComponent(state.qrCode)}`;
    const qrCodeSvg = state.qrCode.trim().startsWith("<svg") ? state.qrCode : null;

    return (
      <div className="card stack">
        <div>
          <h2>Set up authenticator</h2>
          <p className="muted-text">
            Scan the QR code, then enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <div className="mfa-qr-frame">
          {qrCodeSvg ? (
            <div
              aria-label="Authenticator QR code"
              className="mfa-qr-svg"
              dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              role="img"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Authenticator QR code" height={256} src={qrCodeSrc} width={256} />
          )}
        </div>

        <label className="field">
          <span>Manual setup key</span>
          <input className="input mfa-secret" readOnly type="text" value={state.secret} />
        </label>

        <form action={verifyTotpEnrollmentAction} className="stack compact">
          <input name="factorId" type="hidden" value={state.factorId} />
          <input name="challengeId" type="hidden" value={state.challengeId} />
          <input name="next" type="hidden" value={next} />
          <label className="field">
            <span>Authenticator code</span>
            <input
              autoComplete="one-time-code"
              className="input"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
              type="text"
            />
          </label>
          <button className="button" type="submit">
            Verify and continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={beginAction} className="card stack">
      <div>
        <h2>Protect this workspace</h2>
        <p className="muted-text">
          Hosted access requires a TOTP authenticator before the finance workspace opens.
        </p>
      </div>
      {state.status === "error" ? <p className="status error">{state.error}</p> : null}
      <button className="button" disabled={pending} type="submit">
        Start authenticator setup
      </button>
    </form>
  );
}
