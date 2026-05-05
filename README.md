# Process Cross-Section Studio

Browser-based tool for drawing semiconductor process cross-section diagrams and exporting them to PNG, SVG, or PPTX.

## Run Locally

Open `index.html` directly in a browser, or serve the folder locally:

```bash
npm run dev
```

## Deploy As A Web App

This project is a static web app. It can be deployed without a backend.

Recommended first deployment:

```bash
npx vercel
```

Alternative hosts:

- Netlify
- GitHub Pages
- Cloudflare Pages

## Current Architecture

- `index.html`: UI shell
- `styles.css`: layout and visual design
- `app.js`: process simulation, mask editing, export logic

## Product Notes

The current version runs entirely in the browser. Process data is not uploaded to a server unless a future backend is added.

Good next product steps:

- Add project save/load
- Add login and private workspaces
- Add reusable process templates
- Add local/offline enterprise package
- Add billing after export quality and repeat usage are validated
