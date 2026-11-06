# Project Register

Static web app (GitHub Pages) that shares one Supabase project with the Materials app. Same logins, same `app_users` access list.
No customer data lives in this repo; projects are stored in the `project_register` table.

## One-time setup
1. Supabase > **SQL Editor** > run [`supabase.sql`](supabase.sql). It creates the table, row-level security (active `admin` / `div_admin` / `user` people only), and live updates.
2. Push this repo, then **Settings > Pages > Deploy from branch > main / root**. (Pages on a private repo needs a paid GitHub plan; the site itself is reachable by URL, but nothing shows without a login.)
3. Optional: add `https://<username>.github.io/project-register/` under Supabase > Authentication > URL Configuration. Email/password sign-in doesn't need it.

## Local preview
`python3 -m http.server`, then open http://localhost:8000
