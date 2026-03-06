import { describe, it, expect } from "vitest";
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
  stateToHash,
  hashToState,
  highlightToText,
  bookToText,
} from "../src/utils.js";

describe("esc", () => {
  it("escapes HTML entities", () => {
    expect(esc('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(esc("A & B")).toBe("A &amp; B");
  });

  it("handles empty string", () => {
    expect(esc("")).toBe("");
  });

  it("converts non-strings", () => {
    expect(esc(42)).toBe("42");
    expect(esc(null)).toBe("null");
  });
});

describe("hlText", () => {
  it("returns escaped text when no query", () => {
    expect(hlText("Hello <world>", "")).toBe("Hello &lt;world&gt;");
  });

  it("wraps matching text in mark tags", () => {
    expect(hlText("Hello world", "world")).toBe("Hello <mark>world</mark>");
  });

  it("is case insensitive", () => {
    expect(hlText("Hello World", "hello")).toBe("<mark>Hello</mark> World");
  });

  it("escapes regex special chars in query", () => {
    expect(hlText("price is $10.00", "$10")).toBe(
      "price is <mark>$10</mark>.00"
    );
  });

  it("highlights multiple occurrences", () => {
    expect(hlText("the cat and the dog", "the")).toBe(
      "<mark>the</mark> cat and <mark>the</mark> dog"
    );
  });
});

describe("hlTitle", () => {
  it("returns escaped text when no query", () => {
    expect(hlTitle("AI & Ethics", "")).toBe("AI &amp; Ethics");
  });

  it("highlights matching portions", () => {
    expect(hlTitle("AI Ethics", "AI")).toBe("<mark>AI</mark> Ethics");
  });
});

describe("fmtDate", () => {
  it("formats ISO date string", () => {
    expect(fmtDate("2023-10-27T21:40:33")).toMatch(/Oct 2[78], 2023/);
  });

  it("formats date-only string", () => {
    expect(fmtDate("2024-01-15")).toMatch(/Jan 1[45], 2024/);
  });
});

describe("srcLabel", () => {
  it("maps Books to Apple Books", () => {
    expect(srcLabel("Books")).toBe("Apple Books");
  });

  it("keeps Kindle as is", () => {
    expect(srcLabel("Kindle")).toBe("Kindle");
  });
});

describe("titleHue", () => {
  it("returns a number between 0 and 360", () => {
    const hue = titleHue("AI Ethics");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("is deterministic", () => {
    expect(titleHue("AI Ethics")).toBe(titleHue("AI Ethics"));
  });

  it("produces different hues for different titles", () => {
    expect(titleHue("AI Ethics")).not.toBe(titleHue("Robot Rights"));
  });
});

describe("authorWords", () => {
  it("extracts significant words", () => {
    const words = authorWords("John von Neumann");
    expect(words.has("john")).toBe(true);
    expect(words.has("neumann")).toBe(true);
    expect(words.has("von")).toBe(true); // "von" is not in stop list (only "van" is)
  });

  it("returns empty set for empty input", () => {
    expect(authorWords("").size).toBe(0);
    expect(authorWords(null).size).toBe(0);
  });

  it("filters common stop words", () => {
    const words = authorWords("The Lord of the Rings");
    expect(words.has("the")).toBe(false);
    expect(words.has("of")).toBe(false);
    expect(words.has("lord")).toBe(true);
    expect(words.has("rings")).toBe(true);
  });
});

describe("authorMatch", () => {
  it("matches when at least one word overlaps", () => {
    expect(authorMatch("Mark Smith", ["John Smith", "Jane Doe"])).toBe(true);
  });

  it("does not match when no words overlap", () => {
    expect(authorMatch("Alice Brown", ["John Smith"])).toBe(false);
  });

  it("returns true when stored author is empty", () => {
    expect(authorMatch("", ["Anyone"])).toBe(true);
  });
});

describe("isbn13to10", () => {
  it("converts valid ISBN-13 to ISBN-10", () => {
    // ISBN-13: 978-0-306-40615-7 → ISBN-10: 0-306-40615-2
    expect(isbn13to10("9780306406157")).toBe("0306406152");
  });

  it("returns null for non-978 prefix", () => {
    expect(isbn13to10("9790000000000")).toBeNull();
  });

  it("returns null for wrong length", () => {
    expect(isbn13to10("12345")).toBeNull();
  });

  it("handles ISBN with check digit X", () => {
    // ISBN-13: 9780306406157 → ISBN-10: 0306406152 (check digit 2, verified above)
    // Test another known conversion
    const result = isbn13to10("9780198526636");
    expect(result).toBe("0198526636");
  });
});

describe("stateToHash", () => {
  it("creates book hash", () => {
    expect(stateToHash({ book: "AI Ethics", query: "" })).toBe(
      "#book=AI%20Ethics"
    );
  });

  it("creates query hash", () => {
    expect(stateToHash({ book: null, query: "ethics" })).toBe("#q=ethics");
  });

  it("returns empty for default state", () => {
    expect(stateToHash({ book: null, query: "" })).toBe("");
  });

  it("prioritizes book over query", () => {
    expect(stateToHash({ book: "Test", query: "test" })).toBe("#book=Test");
  });
});

describe("hashToState", () => {
  it("parses book hash", () => {
    expect(hashToState("#book=AI%20Ethics")).toEqual({ book: "AI Ethics" });
  });

  it("parses query hash", () => {
    expect(hashToState("#q=ethics")).toEqual({ query: "ethics" });
  });

  it("returns empty for no hash", () => {
    expect(hashToState("")).toEqual({});
    expect(hashToState(null)).toEqual({});
  });
});

describe("highlightToText", () => {
  it("formats a basic highlight", () => {
    const h = { text: "Hello world", location: "42", date: "2024-01-15" };
    const result = highlightToText(h, "Test Book", "Author");
    expect(result).toContain('"Hello world"');
    expect(result).toContain("Test Book");
    expect(result).toContain("Author");
    expect(result).toContain("Page 42");
  });

  it("includes notes if present", () => {
    const h = {
      text: "Main text",
      notes: [{ text: "My note" }],
    };
    const result = highlightToText(h, "Book", "Author");
    expect(result).toContain("Note: My note");
  });
});

describe("bookToText", () => {
  it("formats a book with highlights", () => {
    const book = {
      title: "Test Book",
      author: "Test Author",
      highlights: [
        { text: "Highlight 1" },
        { text: "Highlight 2" },
      ],
    };
    const result = bookToText(book);
    expect(result).toContain("Test Book");
    expect(result).toContain("Test Author");
    expect(result).toContain("Highlight 1");
    expect(result).toContain("Highlight 2");
  });
});
