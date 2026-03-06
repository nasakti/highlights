// ── Pure utility functions (testable, no DOM dependencies) ────

/**
 * HTML-escape a string to prevent XSS.
 */
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Highlight search-query matches in text with <mark> tags.
 * Escapes first, then wraps matches.
 */
export function hlText(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return safe.replace(rx, (m) => `<mark>${m}</mark>`);
}

/**
 * Highlight query in title/author (same logic, separate for clarity).
 */
export function hlTitle(text, q) {
  if (!q) return esc(text);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return esc(text).replace(rx, (m) => `<mark>${m}</mark>`);
}

/**
 * Format an ISO date string to "Mon DD, YYYY".
 */
export function fmtDate(d) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dt = new Date(d);
  return `${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

/**
 * Map internal source value to display label.
 */
export function srcLabel(s) {
  return s === "Books" ? "Apple Books" : s;
}

/**
 * Generate a deterministic hue (0-360) from a book title string.
 * Used for gradient placeholder backgrounds.
 */
export function titleHue(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

// ── ISBN / Author helpers ─────────────────────────────────────

const AW_STOP = new Set([
  "the", "of", "and", "or", "a", "an", "in", "for", "by", "with", "de", "van",
]);

/**
 * Extract significant words from an author name (filtering stop words).
 */
export function authorWords(name) {
  if (!name) return new Set();
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !AW_STOP.has(w))
  );
}

/**
 * Fuzzy-match a stored author against a list of document authors.
 * Returns true if at least one significant word overlaps.
 */
export function authorMatch(stored, docAuthors) {
  const sw = authorWords(stored);
  if (!sw.size) return true;
  return docAuthors.some((da) => {
    const dw = authorWords(da);
    for (const w of sw) if (dw.has(w)) return true;
    return false;
  });
}

/**
 * Convert ISBN-13 to ISBN-10 (needed for Amazon cover URLs).
 * Returns null if input is not a valid ISBN-13 starting with 978.
 */
export function isbn13to10(s) {
  const d = s.replace(/\D/g, "");
  if (d.length !== 13 || !d.startsWith("978")) return null;
  const core = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * +core[i];
  const chk = (11 - (sum % 11)) % 11;
  return core + (chk === 10 ? "X" : String(chk));
}

// ── State persistence ─────────────────────────────────────────

const STATE_KEY = "hl_app_state";

/**
 * Save application state to localStorage.
 */
export function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    /* quota exceeded or private browsing */
  }
}

/**
 * Load application state from localStorage.
 * Returns null if no saved state exists.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Build a URL hash from current state for shareable links.
 */
export function stateToHash(state) {
  if (state.book) return `#book=${encodeURIComponent(state.book)}`;
  if (state.query) return `#q=${encodeURIComponent(state.query)}`;
  return "";
}

/**
 * Parse URL hash into partial state.
 */
export function hashToState(hash) {
  if (!hash || hash.length < 2) return {};
  const params = new URLSearchParams(hash.slice(1));
  if (params.has("book")) return { book: params.get("book") };
  if (params.has("q")) return { query: params.get("q") };
  return {};
}

// ── Theme ─────────────────────────────────────────────────────

const THEME_KEY = "hl_theme";

/**
 * Get saved theme preference, or detect from system.
 */
export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch (e) {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Save theme preference.
 */
export function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    /* ignore */
  }
}

// ── Export helpers ─────────────────────────────────────────────

/**
 * Format a single highlight as plain text.
 */
export function highlightToText(h, bookTitle, bookAuthor) {
  let text = `"${h.text}"`;
  if (bookTitle) text += `\n— ${bookTitle}`;
  if (bookAuthor) text += `, ${bookAuthor}`;
  if (h.location) text += `\n  Page ${h.location}`;
  if (h.date) text += ` | ${fmtDate(h.date)}`;
  if (h.notes && h.notes.length) {
    h.notes.forEach((n) => {
      text += `\n  Note: ${n.text}`;
    });
  }
  return text;
}

/**
 * Format all highlights from a book as plain text.
 */
export function bookToText(book) {
  const lines = [`${book.title}`, `by ${book.author || "Unknown"}`, ""];
  book.highlights.forEach((h, i) => {
    lines.push(`${i + 1}. ${highlightToText(h, null, null)}`);
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Copy text to clipboard. Returns a promise.
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for older browsers
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

/**
 * Trigger a text file download in the browser.
 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
