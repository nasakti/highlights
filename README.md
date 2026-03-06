# Nasakti's Reading Highlights

A personal reading highlights collection web app. Browse, search, and export highlights from **45 books** across Kindle and Apple Books.

## Features

- **Full-text search** across all highlights, notes, and book titles
- **Source filtering** — view highlights from Kindle, Apple Books, or all
- **Gallery view** — visual grid of book covers with lazy loading
- **Dark mode** — toggle or auto-detect from system preference
- **State persistence** — your last view is restored on revisit
- **Shareable links** — URL hash links to specific books (`#book=AI%20Ethics`)
- **Export** — copy all highlights or download as text file
- **Copy highlight** — one-click copy on individual cards
- **Responsive design** — sidebar drawer on mobile
- **Book covers** — fetched from Open Library, Google Books, Wikipedia, Amazon, Goodreads

## Tech Stack

- **Vanilla JavaScript** — no framework dependencies
- **Vite** — dev server and build tool
- **Vitest** — unit testing
- **GitHub Actions** — CI/CD with automated deploy to GitHub Pages

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
├── index.html              # HTML template
├── public/
│   └── data.json           # Book highlights data (45 books, 4753 highlights)
├── src/
│   ├── main.js             # Application logic
│   ├── style.css           # Styles with light & dark themes
│   └── utils.js            # Pure utility functions
├── tests/
│   └── utils.test.js       # Unit tests
├── .github/workflows/
│   └── deploy.yml          # CI: test → build → deploy to GitHub Pages
├── package.json
└── vite.config.js
```

## Deployment

Push to `main` branch triggers automated testing and deployment to GitHub Pages via GitHub Actions.

**Manual deploy:**

```bash
npm run build
# Upload contents of dist/ to your static host
```

## Data Format

Highlight data lives in `public/data.json`. Each book object:

```json
{
  "title": "Book Title",
  "author": "Author Name",
  "source": "Kindle",
  "sources": ["Kindle"],
  "highlights": [
    {
      "text": "Highlighted text...",
      "type": "highlight",
      "location": "42",
      "date": "2024-01-15T10:30:00"
    }
  ],
  "isbn": "9780000000000",
  "asin": "B00EXAMPLE"
}
```

## License

Personal project by [Nasakti](mailto:nasaktighazali@icloud.com).
