// The API returns either a plain string or zod's flattened errors ({ formErrors, fieldErrors }).
export function errorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { formErrors = [], fieldErrors = {} } = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const messages = [...formErrors, ...Object.values(fieldErrors).flatMap((m) => m ?? [])];
    if (messages.length > 0) return messages.join(" ");
  }
  return null;
}
