'use client'
import { useId } from 'react'

export default function RippleMark({ size = 48, rings = true }: { size?: number; rings?: boolean }) {
  const gradId = `ripple-mark-grad-${useId()}`
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 48 55" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="6" y1="4" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4a8bff" />
          <stop offset="1" stopColor="#4ee6d0" />
        </linearGradient>
      </defs>
      {/* stylized "r" as a drop */}
      <path
        d="M14 6C11.24 6 9 8.24 9 11V33C9 34.66 10.34 36 12 36C13.66 36 15 34.66 15 33V17C15 13.13 18.13 10 22 10C24.5 10 26.5 8.5 27.5 6.5C25.4 4.9 22.8 4 20 4C18 4 16 4.5 14.3 5.4C14.2 5.6 14.1 5.8 14 6Z"
        fill={`url(#${gradId})`}
      />
      <circle cx="12" cy="39" r="2.6" fill={`url(#${gradId})`} />
      {rings && (
        <g stroke={`url(#${gradId})`} strokeWidth="1.6" fill="none">
          <ellipse cx="12" cy="46" rx="7" ry="2.1" opacity="0.95" />
          <ellipse cx="12" cy="46" rx="12.5" ry="3.6" opacity="0.7" />
          <ellipse cx="12" cy="46" rx="18" ry="5.1" opacity="0.45" />
        </g>
      )}
    </svg>
  )
}
