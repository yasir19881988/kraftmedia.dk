# Kraft Media

Marketing site for Kraft Media, prepared for GitHub-based deployment to Azure Static Web Apps.

## Structure

- `index.html`: Main landing page markup.
- `dist/`: Production-ready frontend assets used directly by the page.
- `dist/css/style.css`: Base compiled theme stylesheet.
- `dist/css/site-overrides.css`: Site-specific styles for the modal, reveal behavior and local font override.
- `dist/js/main.js`: Local runtime for hero animation, modal behavior and contact form submission.
- `src/html/`: HTML partials and page composition templates.
- `src/`: Source files for SCSS, JavaScript and images.
- `api/`: Azure Static Web Apps API used by the contact form.

## Build commands

- `npm install`: Install the local build dependencies.
- `npm run build`: Generate `index.html` and refresh `dist/` from `src/`.
- `npm run dev`: Watch `src/html`, `src/scss`, `src/js` and `src/images` for changes.
- `npm run clean`: Remove generated frontend output.

## Local-only frontend

The site no longer depends on CDN-hosted JavaScript or external font links.

- All frontend behavior is loaded from local files in `dist/js/`.
- All page-specific styling is loaded from local files in `dist/css/`.
- The contact form posts to `/api/contact`.

## Azure setup

The frontend is designed to deploy together with the `api/` directory through Azure Static Web Apps.

Deployment runs `npm install && npm run build` before upload.

For Azure Communication Services and spam/rate-limit configuration, see `AZURE_COMMUNICATION_SETUP.md`.
