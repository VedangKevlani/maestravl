// Shared by any form using an <input type="datetime-local">, which needs
// "YYYY-MM-DDTHH:mm" in the *local* timezone — neither a raw ISO string
// (UTC) nor Date's own formatting produce that directly.
export function toLocalInputValue(iso: string | Date | null): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
