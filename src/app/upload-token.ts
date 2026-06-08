import { timingSafeEqualString } from "./auth";

export function verifyUploadToken(authHeader: string | null): boolean {
  const expected = process.env.UPLOAD_TOKEN;
  if (!expected) {
    throw new Error("UPLOAD_TOKEN env var is not set");
  }
  if (!authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const presented = authHeader.slice(prefix.length);
  return timingSafeEqualString(presented, expected);
}
