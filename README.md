# Project Register

Static web app (hosted on Vercel) that shares one Supabase project with the Materials app. Same logins, same `app_users` access list.
No customer data lives in this repo; projects are stored in the `project_register` table.

## One-time setup
1. Supabase > **SQL Editor** > run [`supabase.sql`](supabase.sql). It creates the table, row-level security (every active login in `app_users`), and live updates.
2. Push this repo, then in Vercel: **Add New > Project > import `project-register`**. Framework preset **Other**, no build command, no output directory. Deploy.
3. Nothing shows without a login. Sign-in is email + password, so no Supabase redirect URL changes are needed.

## Local preview
`python3 -m http.server`, then open http://localhost:8000
