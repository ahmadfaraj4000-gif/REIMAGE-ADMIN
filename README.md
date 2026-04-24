# RE IMAGE Admin Portal

Clean Vite admin portal folder. This version matches the CR8-style structure:

- `index.html`
- `src/`
- `package.json`
- `package-lock.json` after npm install
- `node_modules/` after npm install
- `vite.config.js`
- `.env` for local Supabase keys

## Local setup

1. Put this folder wherever you want.
2. Create `.env` by copying `.env.example`.
3. Add your Supabase values.
4. Run:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:5500
```

## Important

Do not upload `node_modules` to GitHub. It is recreated by `npm install`.
