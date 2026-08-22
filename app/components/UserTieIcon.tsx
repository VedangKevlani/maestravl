// Lucide has no "person in a suit/tie" icon, but the frontend reference's
// chat avatar uses Font Awesome's fa-user-tie specifically (not a plain
// user glyph) — so this is a small hand-drawn stand-in matching that
// silhouette: a head, shoulders, and a necktie down the chest.
export function UserTieIcon({ size = 14, strokeWidth = 2, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21c0-4.5 2.8-7.5 6.5-7.5s6.5 3 6.5 7.5" />
      <path d="M10.3 13.6 12 16l1.7-2.4" />
      <path d="m12 16-1.1 4.3L12 22l1.1-1.7L12 16Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
