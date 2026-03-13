# Territory Assistant React Starter

This starter preserves the premium login visual language and sets up:

- React + Vite
- Supabase auth bootstrap
- role-aware routing
- command center / campaigns / dashboard shell
- territory background system inspired by your current login page

## Run locally

```bash
npm install
npm run dev
```

## Next implementation steps

1. Import the full territory management map into a React component.
2. Replace sample territory JSON with your production JSON asset.
3. Add `user_roles`, `territories`, `address_logs`, `assignment_history`, `campaigns`, and `do_not_calls` queries.
4. Add route guards and RLS-aware data providers.
5. Move privileged logic into secure server-side functions.


## Residential enrichment pipeline
The original residential-only population flow remains preserved in `public/legacy/territory-management.html`. A companion enrichment workflow using the supplied Playwright scraper now lives under `scripts/enrichment/`.
