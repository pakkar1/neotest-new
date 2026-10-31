import sanitizeHtml from 'sanitize-html';

/**
 * Sanitasi rich text soal/penjelasan. Hanya tag format dasar dan gambar
 * dari host yang diizinkan; script, iframe, event handler, dan style dibuang.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
  'figure', 'figcaption', 'img', 'span', 'div', 'hr',
];

export function sanitizeRichText(input: string): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      script: 'p',
      style: 'p',
      iframe: 'p',
      object: 'p',
      embed: 'p',
    },
  });
}

/** Teks polos: escape agar aman ditampilkan di tempat non-HTML. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripTags(input: string): string {
  return sanitizeHtml(input ?? '', { allowedTags: [], allowedAttributes: {} }).trim();
}
