import {
  esc,
  hlText,
  hlTitle,
  fmtDate,
  srcLabel,
  titleHue,
  authorWords,
  authorMatch,
  isbn13to10,
  saveState,
  loadState,
  stateToHash,
  hashToState,
  getTheme,
  saveTheme,
  highlightToText,
  bookToText,
  copyToClipboard,
  downloadText,
} from "./utils.js";

// ── Data ──────────────────────────────────────────────────────
let ALL_BOOKS = [];

// ── State ─────────────────────────────────────────────────────
let S = { source: "all", book: null, query: "", view: "list" };

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.innerHTML =
      theme === "dark"
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  saveTheme(next);
}

// ── Cover cache ───────────────────────────────────────────────
const COV_NS = "hl_covers_v1:";
const covMem = {};

function covLoad(title) {
  if (title in covMem) return covMem[title];
  try {
    const raw = localStorage.getItem(COV_NS + title);
    covMem[title] = raw !== null && raw !== "null" ? Number(raw) : undefined;
  } catch (e) {
    covMem[title] = undefined;
  }
  return covMem[title];
}

function covSave(title, id) {
  covMem[title] = id;
  if (id !== null) {
    try {
      localStorage.setItem(COV_NS + title, String(id));
    } catch (e) {
      /* ignore */
    }
  }
}

// ── Cover fetching ────────────────────────────────────────────
function applyCoverUrl(card, url) {
  tryCoverChain(card, [url]);
}

function tryCoverChain(card, urls) {
  const img = card.querySelector(".gallery-cover-img");
  if (!img || !urls.length) return;
  let i = 0;
  function tryNext() {
    if (i >= urls.length) {
      img.style.display = "none";
      return;
    }
    img.onload = () => {
      if (img.naturalWidth < 50) {
        tryNext();
        return;
      }
      img.style.opacity = 1;
    };
    img.onerror = tryNext;
    img.src = urls[i++];
  }
  tryNext();
}

function pickCover(docs) {
  for (const doc of docs)
    if (doc.cover_i && authorMatch(doc.author_name?.[0] || "", doc.author_name || []))
      return doc.cover_i;
  for (const doc of docs) if (doc.cover_i) return doc.cover_i;
  return null;
}

function fetchCover(card) {
  const title = card.dataset.t;
  const author = card.dataset.a || "";
  const isbn = card.dataset.isbn;
  const asin = card.dataset.asin;
  const coverUrl = card.dataset.coverUrl;
  const grId = card.dataset.grId;

  // Path A: ISBN known
  if (isbn) {
    const isbn10 = isbn13to10(isbn);
    const amazon10 = isbn10
      ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`
      : null;
    const amazon13 = `https://images-na.ssl-images-amazon.com/images/P/${isbn}.01.LZZZZZZZ.jpg`;
    const oplib = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    const wikiArticle = card.dataset.wiki;

    const gbImg = (d) => {
      try {
        const tbn = d.items[0].volumeInfo.imageLinks.thumbnail;
        return tbn
          .replace("zoom=1", "zoom=0")
          .replace("&edge=curl", "")
          .replace(/^http:\/\//, "https://");
      } catch (e) {
        return null;
      }
    };

    const gbFetch = fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)`
    )
      .then((r) => r.json())
      .then((d) => {
        const v = gbImg(d);
        if (v) return v;
        const q = encodeURIComponent(`intitle:${title}`);
        return fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${q}&fields=items(volumeInfo/imageLinks)`
        )
          .then((r) => r.json())
          .then(gbImg)
          .catch(() => null);
      })
      .catch(() => null);

    const wikiFetch = wikiArticle
      ? fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiArticle)}`
        )
          .then((r) => r.json())
          .then(
            (d) => d.thumbnail?.source?.replace(/\/\d+px-/, "/400px-") || null
          )
          .catch(() => null)
      : Promise.resolve(null);

    const grUrl = grId
      ? `https://www.goodreads.com/book/photo/${grId}`
      : null;

    Promise.all([gbFetch, wikiFetch])
      .then(([gbooks, wiki]) => {
        tryCoverChain(
          card,
          [coverUrl, grUrl, amazon13, amazon10, gbooks, wiki, oplib].filter(
            Boolean
          )
        );
      })
      .catch(() => {
        tryCoverChain(
          card,
          [coverUrl, grUrl, amazon13, amazon10, oplib].filter(Boolean)
        );
      });
    return;
  }

  // Path B: ISBN unknown — Open Library search
  const cached = covLoad(title);
  if (cached !== undefined) {
    if (cached) {
      applyCoverUrl(
        card,
        `https://covers.openlibrary.org/b/id/${cached}-M.jpg`
      );
    } else if (coverUrl || grId) {
      const grUrl2 = grId
        ? `https://www.goodreads.com/book/photo/${grId}`
        : null;
      tryCoverChain(card, [coverUrl, grUrl2].filter(Boolean));
    }
    return;
  }
  covSave(title, null);

  const firstAuthor = author.split(";")[0].split(",")[0].trim();

  const params = new URLSearchParams({
    title,
    limit: "5",
    fields: "author_name,cover_i",
  });
  if (firstAuthor) params.set("author", firstAuthor);

  fetch(`https://openlibrary.org/search.json?${params}`)
    .then((r) => r.json())
    .then((data) => {
      const covId = pickCover(data.docs || []);
      if (covId) {
        covSave(title, covId);
        applyCoverUrl(
          card,
          `https://covers.openlibrary.org/b/id/${covId}-M.jpg`
        );
        return;
      }
      const q = encodeURIComponent(
        title + (firstAuthor ? " " + firstAuthor : "")
      );
      return fetch(
        `https://openlibrary.org/search.json?q=${q}&limit=5&fields=author_name,cover_i`
      )
        .then((r) => r.json())
        .then((data2) => {
          const covId2 = pickCover(data2.docs || []);
          covSave(title, covId2);
          if (covId2) {
            applyCoverUrl(
              card,
              `https://covers.openlibrary.org/b/id/${covId2}-M.jpg`
            );
          } else if (asin) {
            tryCoverChain(card, [
              `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`,
            ]);
          } else if (coverUrl || grId) {
            const grUrl = grId
              ? `https://www.goodreads.com/book/photo/${grId}`
              : null;
            tryCoverChain(card, [coverUrl, grUrl].filter(Boolean));
          }
        });
    })
    .catch(() => {
      /* gradient fallback */
    });
}

// ── Filtering ─────────────────────────────────────────────────
function filtered() {
  return ALL_BOOKS.filter(
    (b) => S.source === "all" || b.sources.includes(S.source)
  );
}

// ── Render sidebar ────────────────────────────────────────────
function renderSidebar() {
  const books = filtered();
  const list = document.getElementById("book-list");
  list.innerHTML = books
    .map((b) => {
      const pips = b.sources
        .map(
          (s) =>
            `<span class="pip ${s === "Kindle" ? "pip-kindle" : "pip-books"}"></span>`
        )
        .join("");
      const active = !S.query && S.book === b.title ? " active" : "";
      return `<div class="book-item${active}" data-t="${esc(b.title)}">
      <div class="book-title">${esc(b.title)}</div>
      <div class="book-meta">
        ${pips}
        <span class="book-count">${b.highlights.length}&thinsp;items</span>
      </div>
    </div>`;
    })
    .join("");

  list.querySelectorAll(".book-item").forEach((el) => {
    el.addEventListener("click", () => {
      S.book = el.dataset.t;
      S.query = "";
      document.getElementById("search").value = "";
      setView("list");
      closeSidebar();
      render();
    });
  });
}

// ── Card ──────────────────────────────────────────────────────
function mkCard(h, q, bookTitle, bookAuthor) {
  const isNote = h.type === "note";
  const qmark = isNote ? "&#10002;" : "\u201C";
  const notesHtml =
    h.notes && h.notes.length > 0
      ? `<div class="card-notes">${h.notes
          .map(
            (n) =>
              `<div class="card-note-item">
          <span class="card-note-icon">&#9998;</span>
          <span class="card-note-text">${hlText(n.text, q)}</span>
        </div>`
          )
          .join("")}</div>`
      : "";
  const titleBdg = bookTitle
    ? `<span class="card-title-bdg">
        <span class="card-title-bdg-t" title="${esc(bookTitle)}">${esc(bookTitle)}</span>
        ${bookAuthor ? `<span class="card-title-bdg-a" title="${esc(bookAuthor)}">${esc(bookAuthor)}</span>` : ""}
      </span>`
    : "";

  const copyIcon = `<button class="card-copy-btn" title="Copy highlight" data-text="${esc(h.text)}">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  </button>`;

  return `<div class="card${isNote ? " card-note" : ""}">
    ${copyIcon}
    <div class="card-qm">${qmark}</div>
    <div class="card-text">${hlText(h.text, q)}</div>
    ${notesHtml}
    <div class="card-foot">
      ${titleBdg}
      ${h.location ? `<span class="card-loc">p. ${h.location}</span>` : ""}
      ${isNote ? `<span class="card-loc">note</span>` : ""}
      ${h.date ? `<span class="card-date">${fmtDate(h.date)}</span>` : ""}
    </div>
  </div>`;
}

// ── Book view ─────────────────────────────────────────────────
function renderBook(book) {
  const srcBadges = book.sources
    .map((s) => {
      const bc = s === "Kindle" ? "badge-kindle" : "badge-books";
      return `<span class="badge ${bc}">${srcLabel(s)}</span>`;
    })
    .join("");
  const notes = book.highlights.reduce(
    (s, h) => s + (h.notes ? h.notes.length : 0),
    0
  );
  const hls = book.highlights.length;
  const hue = titleHue(book.title);
  const hue2 = (hue + 40) % 360;

  document.getElementById("main").innerHTML = `
    <div class="book-hd">
      <div class="book-hd-cover"
           data-t="${esc(book.title)}"
           data-a="${esc(book.author || "")}"
           data-isbn="${esc(book.isbn || "")}"
           data-asin="${esc(book.asin || "")}"
           data-cover-url="${esc(book.cover_url || "")}"
           data-wiki="${esc(book.wiki || "")}"
           data-gr-id="${esc(book.gr_id || "")}"
           style="background:linear-gradient(155deg,hsl(${hue},30%,28%) 0%,hsl(${hue2},42%,18%) 100%)">
        <img class="gallery-cover-img" src="" alt="">
      </div>
      <div class="book-hd-meta">
        <div class="book-hd-title">${esc(book.title)}</div>
        ${book.author ? `<div class="book-hd-author">${esc(book.author)}</div>` : ""}
        <div class="book-hd-badges">
          ${srcBadges}
          ${hls > 0 ? `<span class="badge badge-count">${hls}&thinsp;highlight${hls !== 1 ? "s" : ""}</span>` : ""}
          ${notes > 0 ? `<span class="badge badge-note">${notes}&thinsp;note${notes !== 1 ? "s" : ""}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="book-actions">
      <button class="btn-action" id="btn-copy-all" title="Copy all highlights">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy all
      </button>
      <button class="btn-action" id="btn-download" title="Download as text file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>
    </div>
    <div class="cards">${book.highlights.map((h) => mkCard(h, "", book.title, book.author)).join("")}</div>`;

  fetchCover(document.querySelector(".book-hd-cover"));

  // Export buttons
  document.getElementById("btn-copy-all").addEventListener("click", (e) => {
    const text = bookToText(book);
    copyToClipboard(text).then(() => {
      e.target.closest(".btn-action").classList.add("copied");
      e.target.closest(".btn-action").innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
      setTimeout(() => {
        e.target.closest(".btn-action").classList.remove("copied");
        e.target.closest(".btn-action").innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy all';
      }, 2000);
    });
  });

  document.getElementById("btn-download").addEventListener("click", () => {
    const text = bookToText(book);
    const safe = book.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
    downloadText(`${safe}_highlights.txt`, text);
  });
}

// ── Search view ───────────────────────────────────────────────
function renderSearch(q) {
  const lq = q.toLowerCase();

  const groups = filtered()
    .map((b) => {
      const titleHit =
        b.title.toLowerCase().includes(lq) ||
        (b.author && b.author.toLowerCase().includes(lq));
      const hlHits = b.highlights.filter((h) =>
        h.text.toLowerCase().includes(lq)
      );
      const noteOnlyHits = [];
      b.highlights.forEach((h) => {
        if (
          !h.text.toLowerCase().includes(lq) &&
          h.notes &&
          h.notes.some((n) => n.text.toLowerCase().includes(lq))
        ) {
          noteOnlyHits.push(h);
        }
      });
      return { book: b, hlHits, noteOnlyHits, titleHit };
    })
    .filter(
      (g) =>
        g.titleHit || g.hlHits.length > 0 || g.noteOnlyHits.length > 0
    );

  if (!groups.length) {
    document.getElementById("main").innerHTML = `<div class="empty">
      <div class="empty-glyph">&ldquo;&rdquo;</div>
      <div class="empty-label">No results for &ldquo;${esc(q)}&rdquo;</div>
    </div>`;
    return;
  }

  const titleGroups = groups.filter((g) => g.titleHit);
  const textGroups = groups.filter((g) => !g.titleHit);
  const titleOnlyGroups = titleGroups.filter(
    (g) => g.hlHits.length === 0 && g.noteOnlyHits.length === 0
  );
  const titlePlusGroups = titleGroups.filter(
    (g) => g.hlHits.length > 0 || g.noteOnlyHits.length > 0
  );

  function sgBookCardHtml(g) {
    const hue = titleHue(g.book.title);
    const hue2 = (hue + 40) % 360;
    return `<div class="gallery-card sg-title-card"
        data-t="${esc(g.book.title)}"
        data-a="${esc(g.book.author || "")}"
        data-isbn="${esc(g.book.isbn || "")}"
        data-asin="${esc(g.book.asin || "")}"
        data-cover-url="${esc(g.book.cover_url || "")}"
        data-wiki="${esc(g.book.wiki || "")}"
        data-gr-id="${esc(g.book.gr_id || "")}">
      <div class="gallery-cover"
           style="background:linear-gradient(155deg,hsl(${hue},30%,28%) 0%,hsl(${hue2},42%,18%) 100%)">
        <img class="gallery-cover-img" src="" alt="">
      </div>
      <div class="gallery-info">
        <div class="gallery-card-title">${hlTitle(g.book.title, q)}</div>
        ${g.book.author ? `<div class="gallery-card-author">${hlTitle(g.book.author, q)}</div>` : ""}
      </div>
    </div>`;
  }

  function sgHtml(g) {
    const srcBadgessg = g.book.sources
      .map((s) => {
        const sbc = s === "Kindle" ? "badge-kindle" : "badge-books";
        return `<span class="badge ${sbc} sg-source-badge">${s === "Kindle" ? "Kindle" : "Apple Books"}</span>`;
      })
      .join("");
    const hue = titleHue(g.book.title);
    const hue2 = (hue + 40) % 360;
    const bc = g.book.sources.includes("Kindle")
      ? "badge-kindle"
      : "badge-books";
    const cards = g.hlHits
      .map((h) => mkCard(h, q, g.book.title, g.book.author))
      .join("");
    const noteCards = g.noteOnlyHits
      .map((h) => mkCard(h, q, g.book.title, g.book.author))
      .join("");
    return `<div class="sg${g.titleHit ? " sg-book-match" : ""}">
      <div class="sg-header" data-t="${esc(g.book.title)}">
        <div class="sg-mini-cover"
            data-t="${esc(g.book.title)}"
            data-a="${esc(g.book.author || "")}"
            data-isbn="${esc(g.book.isbn || "")}"
            data-asin="${esc(g.book.asin || "")}"
            data-cover-url="${esc(g.book.cover_url || "")}"
            data-wiki="${esc(g.book.wiki || "")}"
            data-gr-id="${esc(g.book.gr_id || "")}"
            style="background:linear-gradient(155deg,hsl(${hue},30%,28%) 0%,hsl(${hue2},42%,18%) 100%)">
          <img class="gallery-cover-img" src="" alt="">
        </div>
        <div class="sg-label">
          <div class="sg-label-title">${hlTitle(g.book.title, q)}</div>
          ${g.book.author ? `<div class="sg-label-author">${hlTitle(g.book.author, q)}</div>` : ""}
          <div class="sg-label-badges">
            ${srcBadgessg}
            ${g.titleHit ? `<span class="badge ${bc} sg-book-badge">title match</span>` : ""}
          </div>
        </div>
      </div>
      <div class="cards">${cards}${noteCards}</div>
    </div>`;
  }

  const summaryParts = [];
  if (titleGroups.length)
    summaryParts.push(
      `<strong>${titleGroups.length}</strong> book${titleGroups.length !== 1 ? "s" : ""} matching title`
    );
  const contentGroups = [...titlePlusGroups, ...textGroups];
  if (contentGroups.length) {
    const hlTotal = contentGroups.reduce((n, g) => n + g.hlHits.length, 0);
    const noteTotal = contentGroups.reduce(
      (n, g) => n + g.noteOnlyHits.length,
      0
    );
    const parts = [];
    if (hlTotal)
      parts.push(
        `<strong>${hlTotal}</strong> highlight${hlTotal !== 1 ? "s" : ""}`
      );
    if (noteTotal)
      parts.push(
        `<strong>${noteTotal}</strong> note${noteTotal !== 1 ? "s" : ""}`
      );
    if (parts.length)
      summaryParts.push(
        parts.join(" &middot; ") +
          ` in <strong>${contentGroups.length}</strong> book${contentGroups.length !== 1 ? "s" : ""}`
      );
  }

  document.getElementById("main").innerHTML = `
    <div class="search-info">
      ${summaryParts.join(" &middot; ")} &mdash; &ldquo;<strong>${esc(q)}</strong>&rdquo;
    </div>
    ${titleGroups.length ? `<div class="sg-title-books">${titleGroups.map(sgBookCardHtml).join("")}</div>` : ""}
    ${[...titlePlusGroups, ...textGroups].map(sgHtml).join("")}`;

  document
    .getElementById("main")
    .querySelectorAll(".sg-title-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        S.book = card.dataset.t;
        S.query = "";
        setView("list");
        render();
      });
      fetchCover(card);
    });
  document
    .getElementById("main")
    .querySelectorAll(".sg-mini-cover")
    .forEach((cover) => {
      fetchCover(cover);
    });
  document
    .getElementById("main")
    .querySelectorAll(".sg-header")
    .forEach((hdr) => {
      hdr.addEventListener("click", () => {
        S.book = hdr.dataset.t;
        S.query = "";
        setView("list");
        render();
      });
    });
}

// ── Home ──────────────────────────────────────────────────────
function renderHome() {
  const dated = [];
  ALL_BOOKS.forEach((b) => {
    b.highlights.forEach((h) => {
      if (h.date) dated.push({ h, book: b });
    });
  });
  dated.sort((a, b) => new Date(b.h.date) - new Date(a.h.date));

  const featured = dated[0] || null;
  const seenBooks = new Set();
  const recentBooks = [];
  dated.forEach(({ book }) => {
    if (!seenBooks.has(book.title)) {
      seenBooks.add(book.title);
      recentBooks.push(book);
    }
  });
  ALL_BOOKS.forEach((b) => {
    if (!seenBooks.has(b.title)) recentBooks.push(b);
  });
  const topBooks = recentBooks.slice(0, 4);
  const recentHls = dated.slice(1, 6);

  const bookCardHtml = (b) => {
    const hue = titleHue(b.title);
    const hue2 = (hue + 40) % 360;
    return `<div class="gallery-card"
        data-t="${esc(b.title)}"
        data-isbn="${esc(b.isbn || "")}"
        data-asin="${esc(b.asin || "")}"
        data-cover-url="${esc(b.cover_url || "")}"
        data-wiki="${esc(b.wiki || "")}"
        data-gr-id="${esc(b.gr_id || "")}">
      <div class="gallery-cover"
           style="background:linear-gradient(155deg,hsl(${hue},30%,28%) 0%,hsl(${hue2},42%,18%) 100%)">
        <img class="gallery-cover-img" src="" alt="">
      </div>
      <div class="gallery-info">
        <div class="gallery-card-title">${esc(b.title)}</div>
        ${b.author ? `<div class="gallery-card-author">${esc(b.author)}</div>` : ""}
      </div>
    </div>`;
  };

  document.getElementById("main").innerHTML = `
    <div class="home-wrap">
      ${
        featured
          ? `
        <div class="home-featured" data-t="${esc(featured.book.title)}">
          <div class="home-featured-label">Latest highlight</div>
          <div class="home-featured-qm">\u201C</div>
          <div class="home-featured-text">${hlText(featured.h.text, "")}</div>
          <div class="home-featured-from">
            <span class="home-featured-from-title">${esc(featured.book.title)}</span>
            ${featured.book.author ? `<span class="home-featured-from-author">${esc(featured.book.author)}</span>` : ""}
            <span class="home-featured-from-meta">
              ${featured.h.location ? `<span>p. ${featured.h.location}</span>` : ""}
              ${featured.h.date ? `<span>${fmtDate(featured.h.date)}</span>` : ""}
            </span>
          </div>
        </div>
      `
          : ""
      }
      ${
        topBooks.length
          ? `
        <div class="home-section">
          <div class="home-section-title">Recently read</div>
          <div class="home-gallery">${topBooks.map(bookCardHtml).join("")}</div>
        </div>
      `
          : ""
      }
      ${
        recentHls.length
          ? `
        <div class="home-section">
          <div class="home-section-title">Recent highlights</div>
          <div class="cards">
            ${recentHls.map(({ h, book }) => mkCard(h, "", book.title, book.author)).join("")}
          </div>
        </div>
      `
          : ""
      }
    </div>`;

  document
    .getElementById("main")
    .querySelectorAll(".home-featured, .gallery-card")
    .forEach((el) => {
      el.addEventListener("click", () => {
        S.book = el.dataset.t;
        S.query = "";
        document.getElementById("search").value = "";
        render();
      });
    });

  document
    .getElementById("main")
    .querySelectorAll(".gallery-card")
    .forEach((card) => {
      fetchCover(card);
    });
}

// ── Gallery ───────────────────────────────────────────────────
let galObs = null;

function renderGallery() {
  document.querySelector(".layout").classList.add("gallery-mode");
  const books = filtered();
  document.getElementById("main").innerHTML = `<div class="gallery">${books
    .map((b) => {
      const hue = titleHue(b.title);
      const hue2 = (hue + 55) % 360;
      const nc = b.highlights.reduce(
        (n, h) => n + (h.notes?.length || 0),
        0
      );
      return `<div class="gallery-card"
          data-t="${esc(b.title)}"
          data-a="${esc(b.author || "")}"
          data-isbn="${esc(b.isbn || "")}"
          data-asin="${esc(b.asin || "")}"
          data-cover-url="${esc(b.cover_url || "")}"
          data-wiki="${esc(b.wiki || "")}"
          data-gr-id="${esc(b.gr_id || "")}">
        <div class="gallery-cover"
             style="background:linear-gradient(155deg,hsl(${hue},30%,28%) 0%,hsl(${hue2},42%,18%) 100%)">
          <img class="gallery-cover-img" src="" alt="">
        </div>
        <div class="gallery-info">
          <div class="gallery-card-title">${esc(b.title)}</div>
          ${b.author ? `<div class="gallery-card-author">${esc(b.author)}</div>` : ""}
          <div class="gallery-badges">
            <span class="gb-hl">${b.highlights.length} hl</span>
            ${nc ? `<span class="gb-notes">${nc} notes</span>` : ""}
          </div>
        </div>
      </div>`;
    })
    .join("")}</div>`;

  document
    .getElementById("main")
    .querySelectorAll(".gallery-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        setView("list");
        S.book = card.dataset.t;
        S.query = "";
        document.getElementById("search").value = "";
        render();
      });
    });

  if (galObs) galObs.disconnect();
  galObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          fetchCover(e.target);
          galObs.unobserve(e.target);
        }
      });
    },
    { rootMargin: "150px" }
  );
  document
    .getElementById("main")
    .querySelectorAll(".gallery-card")
    .forEach((c) => galObs.observe(c));
}

// ── View ──────────────────────────────────────────────────────
function setView(v) {
  S.view = v;
  document
    .querySelectorAll(".view-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  if (v === "list")
    document.querySelector(".layout").classList.remove("gallery-mode");
}

// ── Footer ────────────────────────────────────────────────────
const FOOTER_HTML = `<div class="app-footer">vibe coded with <svg width="9" height="9" viewBox="0 0 24 24" fill="#c0392b" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> with <span class="credit-claude">Claude</span></div>`;

function appendFooter() {
  document.getElementById("main").insertAdjacentHTML("beforeend", FOOTER_HTML);
}

// ── Master render ─────────────────────────────────────────────
function render() {
  if (S.view === "gallery" && !S.query) {
    renderGallery();
    appendFooter();
    persistState();
    return;
  }
  document.querySelector(".layout").classList.remove("gallery-mode");
  renderSidebar();
  if (S.query.length >= 2) {
    renderSearch(S.query);
    appendFooter();
    persistState();
    return;
  }
  const book = filtered().find((b) => b.title === S.book);
  book ? renderBook(book) : renderHome();
  appendFooter();
  attachCardCopyHandlers();
  persistState();
}

// ── Card copy handlers ────────────────────────────────────────
function attachCardCopyHandlers() {
  document.querySelectorAll(".card-copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      copyToClipboard(text).then(() => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      });
    });
  });
}

// ── State persistence ─────────────────────────────────────────
function persistState() {
  saveState(S);
  const hash = stateToHash(S);
  if (hash) {
    history.replaceState(null, "", hash);
  } else if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
}

function restoreState() {
  // URL hash takes priority
  const fromHash = hashToState(window.location.hash);
  if (fromHash.book || fromHash.query) {
    Object.assign(S, fromHash);
    return;
  }
  // Otherwise restore from localStorage
  const saved = loadState();
  if (saved) {
    if (saved.source) S.source = saved.source;
    if (saved.book) S.book = saved.book;
    if (saved.view) S.view = saved.view;
    // Don't restore query — start fresh
  }
}

// ── Sidebar mobile ────────────────────────────────────────────
function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("mob-open");
  document.getElementById("mob-overlay").classList.remove("active");
}

function openSidebar() {
  document.querySelector(".sidebar").classList.add("mob-open");
  document.getElementById("mob-overlay").classList.add("active");
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  let totalHighlights = 0;
  let totalNotes = 0;
  ALL_BOOKS.forEach((b) => {
    totalHighlights += b.highlights.length;
    b.highlights.forEach((h) => {
      if (h.notes) totalNotes += h.notes.length;
    });
  });
  document.getElementById("stat-books").innerHTML = `<span class="n">${ALL_BOOKS.length}</span> books`;
  document.getElementById("stat-highlights").innerHTML = `<span class="n">${totalHighlights}</span> highlights`;
  document.getElementById("stat-notes").innerHTML = `<span class="n">${totalNotes}</span> notes`;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  // Apply theme immediately
  applyTheme(getTheme());

  // Show loading state
  document.getElementById("main").innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <span>Loading highlights&hellip;</span>
    </div>`;

  try {
    // Try Vite-served path first, then fall back to raw repo path
    let resp = await fetch("data.json").catch(() => null);
    if (!resp || !resp.ok) resp = await fetch("public/data.json");
    ALL_BOOKS = await resp.json();
  } catch (e) {
    document.getElementById("main").innerHTML = `
      <div class="empty">
        <div class="empty-glyph">!</div>
        <div class="empty-label">Failed to load data. Please refresh.</div>
      </div>`;
    return;
  }

  updateStats();
  restoreState();

  // Apply restored state to UI
  if (S.source !== "all") {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    const btn = document.querySelector(
      `.filter-btn[data-source="${S.source}"]`
    );
    if (btn) btn.classList.add("active");
  }
  if (S.view !== "list") setView(S.view);

  render();

  // ── Event listeners ─────────────────────────────────────────

  // Source filter
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      S.source = btn.dataset.source;
      S.book = null;
      S.query = "";
      document.getElementById("search").value = "";
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });

  // View toggle
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      S.query = "";
      document.getElementById("search").value = "";
      setView(btn.dataset.view);
      render();
    });
  });

  // Theme toggle
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);

  // Search
  let st;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(st);
    st = setTimeout(() => {
      S.query = e.target.value.trim();
      render();
    }, 160);
  });

  // If we restored a query, set it in input
  if (S.query) {
    document.getElementById("search").value = S.query;
  }

  // Mobile sidebar
  document
    .getElementById("mob-menu-btn")
    .addEventListener("click", () => {
      document.querySelector(".sidebar").classList.contains("mob-open")
        ? closeSidebar()
        : openSidebar();
    });
  document.getElementById("mob-overlay").addEventListener("click", closeSidebar);
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", closeSidebar);
  });

  // Hero title → home
  document.querySelector(".hero-title").addEventListener("click", () => {
    S.book = null;
    S.query = "";
    S.view = "list";
    document.getElementById("search").value = "";
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelector('.filter-btn[data-source="all"]')
      .classList.add("active");
    S.source = "all";
    closeSidebar();
    render();
  });

  // Hash navigation
  window.addEventListener("hashchange", () => {
    const fromHash = hashToState(window.location.hash);
    if (fromHash.book) {
      S.book = fromHash.book;
      S.query = "";
      setView("list");
      render();
    }
  });
}

init();
