# Policy source

Policies are versioned in the migrations under `supabase/migrations`. Every table has row-level security enabled and `anon` and `authenticated` have no grants at all: browsers never talk to the database. Only the Next.js server reads and writes, using the secret key, which must never reach a browser or the desktop app. Devices authenticate to the server's API with hashed device tokens, not database credentials.
