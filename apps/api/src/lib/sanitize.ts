import sanitizeHtml from 'sanitize-html';

/**
 * Shared sanitize-html options for rich content (replies, notes, canned responses).
 * Allows the full set of formatting tags expected in email-style HTML.
 */
export const RICH_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
    'blockquote', 'pre', 'code', 'span', 'div', 'img',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'h1', 'h2', 'h3', 'h4',
  ],
  allowedAttributes: {
    'a':   ['href', 'target'],
    'img': ['src', 'alt', 'width', 'height'],
    '*':   ['style'],
  },
  disallowedTagsMode: 'discard',
};

/**
 * Shared sanitize-html options for mailbox signatures and other plain-formatting HTML.
 * Narrower than RICH_HTML — no tables, block-level extras, or headings.
 */
export const SIGNATURE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'span', 'div', 'img'],
  allowedAttributes: {
    'a':   ['href', 'target'],
    'img': ['src', 'alt', 'width', 'height'],
    '*':   ['style'],
  },
  disallowedTagsMode: 'discard',
};

/** Convenience wrapper */
export function sanitize(html: string, options = RICH_HTML_OPTIONS): string {
  return sanitizeHtml(html, options);
}
