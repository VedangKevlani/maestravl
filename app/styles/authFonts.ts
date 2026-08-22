import { Bricolage_Grotesque } from 'next/font/google'

// The new auth design pairs Manrope (already loaded globally) with
// Bricolage Grotesque for headings. Scoped here so it only loads on the
// auth pages rather than adding another sitewide font.
export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})
