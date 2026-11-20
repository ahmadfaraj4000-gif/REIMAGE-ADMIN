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

## Contract project drafts

Apply the two 20261120 SQL migrations from the website repository to the portal's Supabase database after its existing public.is_admin() policy helper. In Products, build a catalog cart and choose **Create project from cart**. Staff can recall drafts under **Project orders** in either Orders or Invoices. Dates and amounts are draft terms pending tax and signature.

The website's dispatch-contract-email Edge Function processes one due contract notification per authenticated POST. Set BREVO_API_KEY, BREVO_SENDER_EMAIL (a verified Brevo sender), and CONTRACT_EMAIL_WORKER_SECRET in Supabase function secrets. After deploying the migrations and function, configure a server-side scheduler to POST to the function with the worker secret as a bearer token. Keep these credentials out of Vite. Draft creation never queues signing invitations or receipts. The signing and verified payment integrations must create those events. Accepted means Brevo acknowledged submission. Reconcile needs_review jobs with Brevo before manually retrying them.
