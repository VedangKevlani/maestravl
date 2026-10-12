// Who counts as a developer/operator. There's no role column in the
// database — a comma-separated ADMIN_EMAILS env var keeps this out of the
// app's own data entirely, so no in-app action (or bug) can ever grant it,
// and it's set the same way locally (.env) and in production (Vercel
// project settings). Unset means nobody is an admin: fail closed.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}
