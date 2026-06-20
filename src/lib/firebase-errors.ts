export function toUserMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const known: Record<string, string> = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network unavailable. Check your connection and retry.",
    "permission-denied": "You do not have permission to perform this action.",
    unavailable: "The service is temporarily unavailable. Please retry.",
  };
  if (known[code]) return known[code];
  return error instanceof Error ? error.message : "Something went wrong. Please retry.";
}
