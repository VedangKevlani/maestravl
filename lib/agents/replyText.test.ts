import { describe, it, expect } from 'vitest'
import { stripQuotedReply, htmlToPlainText, extractReplyContent, snippetOf } from './replyText'

describe('stripQuotedReply', () => {
  it('cuts at an "On ... wrote:" header', () => {
    const text = 'Sure, 11:26pm works for us.\n\nOn Mon, Aug 10, 2026 at 2:00 PM Maestravl wrote:\n> Could you please confirm...'
    expect(stripQuotedReply(text)).toBe('Sure, 11:26pm works for us.')
  })

  it('cuts at a run of "> " quoted lines even without a header', () => {
    const text = 'Yes that works.\n\n> Hello,\n> Our passenger has been delayed.\n> Could you confirm?'
    expect(stripQuotedReply(text)).toBe('Yes that works.')
  })

  it('leaves short replies with no quote block untouched', () => {
    expect(stripQuotedReply('Yes, that works for us.')).toBe('Yes, that works for us.')
  })
})

describe('htmlToPlainText', () => {
  it('converts basic HTML to readable text', () => {
    expect(htmlToPlainText('<p>Yes that works.</p><p>Thanks!</p>')).toBe('Yes that works.\n\nThanks!')
  })

  it('strips style/script blocks and decodes entities', () => {
    const html = '<style>.x{color:red}</style><p>Rate is &lt;$50&gt; &amp; includes tax</p>'
    expect(htmlToPlainText(html)).toBe('Rate is <$50> & includes tax')
  })
})

describe('extractReplyContent', () => {
  it('prefers text over html when both are present', () => {
    expect(extractReplyContent({ text: 'plain version', html: '<p>html version</p>' })).toBe('plain version')
  })

  it('falls back to html converted to text when text is missing', () => {
    expect(extractReplyContent({ text: null, html: '<p>html only</p>' })).toBe('html only')
  })

  it('strips quoted history from the chosen content', () => {
    const result = extractReplyContent({
      text: 'Confirmed, see you then.\n\nOn Tue wrote:\n> original message',
      html: null,
    })
    expect(result).toBe('Confirmed, see you then.')
  })

  it('returns an empty string rather than throwing when there is no content at all', () => {
    expect(extractReplyContent({ text: null, html: null })).toBe('')
  })
})

describe('snippetOf', () => {
  it('returns short content unchanged', () => {
    expect(snippetOf('Yes that works.')).toBe('Yes that works.')
  })

  it('truncates long content with an ellipsis', () => {
    const long = 'a'.repeat(300)
    const snippet = snippetOf(long)
    expect(snippet.length).toBeLessThan(long.length)
    expect(snippet.endsWith('…')).toBe(true)
  })
})
