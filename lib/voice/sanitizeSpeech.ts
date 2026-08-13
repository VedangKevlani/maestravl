// Pure — a defensive cleanup pass on the model's reply before it's spoken
// (lib/voice/tts.ts) or shown in the transcript bubble (VoiceWidget.tsx).
// The system prompt already instructs plain spoken sentences with no
// markdown, but a model can still leak formatting habits from its training
// (a stray "**bold**", a "- " bullet, a "#" header) that read as garbled
// noise once spoken aloud or rendered literally as asterisks. This never
// tries to be a full TTS text normalizer (number/date spelling stays the
// system prompt's job) — just strips what would otherwise sound broken.
export function toSpeakableText(text: string): string {
  return text
    // **bold**, *italic*/bullet, _underscore emphasis_, `code`
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(^|\n)\s*[*\-•]\s+/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, '$1$2')
    .replace(/(^|\s)_(\S.*?\S|\S)_(?=\s|$)/g, '$1$2')
    // Markdown headers
    .replace(/(^|\n)#{1,6}\s+/g, '$1')
    // Collapse whitespace — this is spoken as one continuous reply, not
    // displayed as formatted paragraphs.
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
}
