import { JSDOM } from 'jsdom'

const DIGIT_RE = /\d/
const SCORE_LIST_RE = /\b\d{1,4}(?:\s*[–—-]\s*\d{1,4})(?:\s*,\s*\d{1,4}(?:\s*[–—-]\s*\d{1,4}))*\b/

function hasDigits(s?: string | null): boolean {
  return !!(s && DIGIT_RE.test(s))
}

function extractNumericHint(el: Element): string | undefined {
  const attrs = el.getAttributeNames()
  for (const name of attrs) {
    if (!/^data-|^aria-|^title$|^alt$|^content$/.test(name)) continue
    const v = el.getAttribute(name)
    if (hasDigits(v)) return v || undefined
  }
  // Look up to parent for a hint if none on this node
  const parent = el.parentElement
  if (parent) return extractNumericHint(parent)
  return undefined
}

function fillEmptyParens(text: string, hint: string): string {
  // Replace common empty patterns: (), ( ), (, words), (- - -)
  const patterns = [
    /\(\s*\)/g,
    /\(\s*,\s*[^)]*\)/g,
    /\(\s*[-–—]\s*[-–—]\s*[-–—]\s*\)/g,
  ]
  let out = text
  for (const re of patterns) {
    if (re.test(out)) out = out.replace(re, `(${hint})`)
  }
  return out
}

function repairTextNode(node: Text, contextEl: Element, globalScore?: string) {
  const original = node.nodeValue || ''
  if (!original.trim()) return
  // If this text already contains digits, skip.
  if (hasDigits(original)) return
  const hint = extractNumericHint(contextEl)
  let updated = original
  if (hasDigits(hint)) {
    // Replace empty parens and common placeholders using hint
    const r1 = fillEmptyParens(updated, hint!)
    if (r1 !== updated) {
      updated = r1
    } else {
      // Ranks/seed placeholders within this text chunk
      const lower = updated.toLowerCase()
      const mInt = String(hint!.match(/\d{1,4}/)?.[0] || '')
      if (mInt) {
        if (/\bno\.(?:\s*[-–—])?(?=\s|[),.])/.test(lower)) {
          updated = updated.replace(/\bNo\.(?:\s*[-–—])?(?=\s|[),.])/g, `No. ${mInt}`)
        } else if (/\b(seed|rank)\b\s*[-–—]?(?=\s|[),.])/.test(lower)) {
          updated = updated.replace(/\b(Seed|Rank)\b\s*[-–—]?(?=\s|[),.])/g, (_m, w) => `${w} ${mInt}`)
        } else if (/\[\s*[-–—]?\s*\]/.test(updated)) {
          updated = updated.replace(/\[\s*[-–—]?\s*\]/g, `[${mInt}]`)
        }
      }
      if (updated === original) {
        // As a last resort, append hint in parentheses to preserve numbers contextually
        const sep = original.trim().endsWith('.') ? ' ' : ' '
        updated = `${original}${sep}(${hint})`
      }
    }
  } else if (globalScore) {
    // Global score fallback for simple placeholders in this text chunk
    let r = updated.replace(/\(\s*[-–—]?\s*\)/g, `(${globalScore})`)
    r = r.replace(/(?:^|\s)(?:[-–—]\s*,\s*){1,}[-–—](?:\s|$)/g, ` ${globalScore} `)
    r = r.replace(/(?:^|\s)(?:[-–—]\s+){2,}[-–—](?=\s|$)/g, ` ${globalScore} `)
    updated = r
  }
  if (updated !== original) node.nodeValue = updated
}

export function preserveNumbersInHtml(html: string): string {
  try {
    const dom = new JSDOM(`<div id="__root">${html}</div>`)
    const doc = dom.window.document
    const root = doc.getElementById('__root')!
    // Attempt to find a global score token (from title/meta or text) to use for empty placeholders
    let globalScore: string | undefined
    const title = doc.querySelector('title')?.textContent || ''
    const metaOgTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
    globalScore = (title.match(SCORE_LIST_RE)?.[0]) || (metaOgTitle.match(SCORE_LIST_RE)?.[0]) || undefined
    if (!globalScore) {
      const docText = root.textContent || ''
      const m = docText.match(SCORE_LIST_RE)
      if (m) globalScore = m[0]
    }
    // Walk all text nodes and attempt localized repairs without altering structure
    const tw = doc.createTreeWalker(root, dom.window.NodeFilter.SHOW_TEXT)
    let n = tw.nextNode() as Text | null
    while (n) {
      const parentEl = n.parentElement as Element | null
      if (parentEl) repairTextNode(n, parentEl, globalScore)
      n = tw.nextNode() as Text | null
    }
    return root.innerHTML
  } catch {
    return html
  }
}

export function htmlToPlainText(html: string): string {
  try {
    const dom = new JSDOM(`<div id="__root">${html}</div>`)
    const doc = dom.window.document
    const text = doc.getElementById('__root')?.textContent || ''
    return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim()
  }
}
