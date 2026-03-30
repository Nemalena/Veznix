"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIGNATURE_HTML_OPTIONS = exports.RICH_HTML_OPTIONS = void 0;
exports.sanitize = sanitize;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
/**
 * Shared sanitize-html options for rich content (replies, notes, canned responses).
 * Allows the full set of formatting tags expected in email-style HTML.
 */
exports.RICH_HTML_OPTIONS = {
    allowedTags: [
        'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
        'blockquote', 'pre', 'code', 'span', 'div', 'img',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'h1', 'h2', 'h3', 'h4',
    ],
    allowedAttributes: {
        'a': ['href', 'target'],
        'img': ['src', 'alt', 'width', 'height'],
        '*': ['style'],
    },
    disallowedTagsMode: 'discard',
};
/**
 * Shared sanitize-html options for mailbox signatures and other plain-formatting HTML.
 * Narrower than RICH_HTML — no tables, block-level extras, or headings.
 */
exports.SIGNATURE_HTML_OPTIONS = {
    allowedTags: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'span', 'div', 'img'],
    allowedAttributes: {
        'a': ['href', 'target'],
        'img': ['src', 'alt', 'width', 'height'],
        '*': ['style'],
    },
    disallowedTagsMode: 'discard',
};
/** Convenience wrapper */
function sanitize(html, options = exports.RICH_HTML_OPTIONS) {
    return (0, sanitize_html_1.default)(html, options);
}
