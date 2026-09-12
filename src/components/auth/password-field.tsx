"use client";

import { useId, useState } from "react";

type PasswordFieldProps = {
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
  name?: string;
  pattern?: string;
  title?: string;
};

export function PasswordField({
  autoComplete,
  hint,
  minLength,
  name = "password",
  pattern,
  title,
}: PasswordFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={inputId}>Password</label>
      <span className="password-field">
        <input
          aria-describedby={hint ? hintId : undefined}
          autoComplete={autoComplete}
          className="input"
          id={inputId}
          minLength={minLength}
          name={name}
          pattern={pattern}
          required
          title={title}
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
