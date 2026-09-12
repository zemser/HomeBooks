export const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,}";
export const PASSWORD_HINT = "At least 10 characters, with mixed case and a number.";

export function getPasswordValidationError(password: string) {
  if (password.length < 10) {
    return "Password must be at least 10 characters.";
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
}

export function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Household member";
}
