/**
 * Sentences already in the feed text. Decimals and initials such as "J.K." stay inside
 * the sentence. Nothing here writes new words.
 */
export function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!
    buf += ch
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    const prev = clean[i - 1] ?? ''
    const next = clean[i + 1] ?? ''
    if (ch === '.' && /\d/.test(prev) && /\d/.test(next)) continue
    if (ch === '.' && /[A-Z]/.test(prev) && /[A-Za-z]/.test(next)) continue
    let j = i + 1
    while (j < clean.length && /["')\]]/.test(clean[j]!)) {
      buf += clean[j]!
      j++
    }
    if (j < clean.length && !/\s/.test(clean[j]!)) continue
    const piece = buf.trim()
    if (piece) out.push(piece)
    buf = ''
    i = j
    while (i + 1 < clean.length && clean[i + 1] === ' ') i++
  }
  const rest = buf.trim()
  if (rest) out.push(rest)
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The first 2–4 sentences of the feed's own text.
 * A single sentence stays one sentence. A headline with no body returns null.
 * The result is a join of sentences taken from `body`; it adds no new sentence.
 */
export function previewText(body: string | null | undefined, headline?: string | null): string | null {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (headline && norm(text) === norm(headline)) return null
  const parts = sentences(text)
  if (parts.length === 0) return null
  const n = parts.length < 2 ? parts.length : Math.min(4, parts.length)
  return parts.slice(0, n).join(' ')
}
