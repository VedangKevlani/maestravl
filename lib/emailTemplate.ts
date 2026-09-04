// Shared branded HTML shell for every outbound email — passenger-facing and
// provider-facing alike. Table-based layout with inline styles throughout
// (not flexbox/grid, not a <style> block) because email clients, Outlook's
// Word-based renderer especially, don't reliably support either — this is
// the standard "bulletproof email" constraint, not an oversight.
//
// Light background deliberately, not the marketing site's dark cinematic
// theme: a provider reading a real request from a stranger, or a passenger
// mid-disruption on their phone, needs something that reads as ordinary
// professional correspondence, not a pitch-deck aesthetic. Same brand
// palette (see app/globals.css), applied to a medium where it has to
// actually work across a15-year-old rendering engine.

const BRAND = {
  ink: '#141414',
  muted: '#5b6069',
  border: '#e4e2dc',
  page: '#f5f3ef',
  card: '#ffffff',
  emerald: '#2f8f5b',
  emeraldBg: '#eaf5ee',
  amber: '#b5791a',
  amberBg: '#fbf1de',
}

const LOGO_URL = 'https://maestravl.com/maestravl-logo.png'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailCallout {
  tone: 'amber' | 'emerald'
  html: string
}

/**
 * Wraps body content (already-composed HTML, headings/paragraphs/lists) in
 * the full branded document: banner with the Maestravl mark + a one-line
 * "what this is" for a reader who's never heard of it (a provider getting
 * a first-ever email from Maestravl needs that context a passenger
 * wouldn't), then the content card, then a plain-language footer.
 */
export function wrapEmail(opts: { preheader?: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:${BRAND.page}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  ${opts.preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Banner -->
          <tr>
            <td style="background:${BRAND.ink}; border-radius:14px 14px 0 0; padding:24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle; padding-right:10px;">
                    <img src="${LOGO_URL}" alt="Maestravl" height="28" style="display:block; height:28px; width:auto;" />
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0; font-size:12.5px; line-height:1.5; color:#c9cdd3;">
                Maestravl is an autonomous trip-recovery agent — when a flight, train, or hotel booking is disrupted, it works out what else that affects and coordinates the fix, with a person always confirming before anything real changes.
              </p>
            </td>
          </tr>

          <!-- Content card -->
          <tr>
            <td style="background:${BRAND.card}; border:1px solid ${BRAND.border}; border-top:none; border-radius:0 0 14px 14px; padding:32px 28px; color:${BRAND.ink}; font-size:14.5px; line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px 0; text-align:center; font-size:11.5px; color:#9a9690;">
              Sent by Maestravl on behalf of a traveler using the platform.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function emailHeading(text: string): string {
  return `<h2 style="margin:0 0 14px; font-size:18px; font-weight:700; color:${BRAND.ink}; letter-spacing:-0.01em;">${escapeHtml(text)}</h2>`
}

export function emailCallout({ tone, html }: EmailCallout): string {
  const bg = tone === 'amber' ? BRAND.amberBg : BRAND.emeraldBg
  const fg = tone === 'amber' ? BRAND.amber : BRAND.emerald
  return `<div style="background:${bg}; border-left:3px solid ${fg}; border-radius:6px; padding:12px 16px; margin:16px 0; font-size:13.5px; color:${BRAND.ink};">${html}</div>`
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr><td style="background:${BRAND.emerald}; border-radius:8px;"><a href="${href}" style="display:inline-block; padding:11px 22px; font-size:13.5px; font-weight:700; color:#ffffff; text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

/**
 * Renders a plain-text composed message (lib/agents/message.ts's
 * composeRescheduleRequest/composeAwarenessInquiry — pure, tested
 * functions this deliberately doesn't touch) as structured HTML: a line
 * ending in ":" becomes a small-caps label, the line under it becomes its
 * value. That's the exact convention those composers already follow
 * ("Original time:" / the time on the next line), so this needs no
 * changes on the composing side to get real visual structure on the
 * sending side.
 */
export function formatMessageBodyHtml(body: string): string {
  const parts: string[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    if (line.endsWith(':') && line.length < 40) {
      parts.push(
        `<p style="margin:16px 0 2px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${BRAND.muted};">${escapeHtml(line)}</p>`
      )
    } else {
      parts.push(`<p style="margin:0 0 4px; font-size:14.5px; color:${BRAND.ink};">${escapeHtml(raw)}</p>`)
    }
  }
  return parts.join('')
}

export { BRAND, escapeHtml }
