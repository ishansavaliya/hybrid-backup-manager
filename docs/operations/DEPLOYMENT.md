# Hosted dashboard deployment

Deployment is optional for the local engine. This session has not deployed a hosted dashboard or created a Supabase project.

1. Create a Supabase project and apply `supabase/migrations/202611070001_foundation.sql` using the Supabase CLI migrations flow. Review RLS tests in `tests/database/` first.
2. Configure email sign-in, your exact site URL and allowed redirect URLs in Supabase Auth. Development email allowances/rate limits are not a production transactional-email service.
3. In Vercel import the monorepo, select Next.js and root directory `apps/web`; enable access to workspace files outside that directory. Use the supplied build/install configuration. Preserve the root pnpm lockfile.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project. Neither is a service-role key. Redeploy after changing public environment values.
5. Verify real sign-in, redirect behavior, isolation between two actual accounts and offline/error behavior. No browser write access or enrollment is enabled yet; an empty account is expected.

Local `.env.local` for development belongs in `apps/web/` and must not be committed. No provider OAuth client secret, refresh token or repository password belongs in public environment variables.

## Costs and limits

Review current [Vercel Hobby terms](https://vercel.com/docs/plans/hobby), [Supabase pricing](https://supabase.com/pricing) and [Supabase production guidance](https://supabase.com/docs/guides/platform/going-into-prod). Hobby eligibility and commercial-use restrictions must be checked for the actual deployment. Supabase Free quotas, inactivity pauses, database size, egress and auth email limits can interrupt hosted management. Free-tier terms are not a durability or uptime guarantee. Back up metadata independently when appropriate.

Customer backup archives go directly to customer storage. They never pass through Vercel or into Supabase. Cloud storage, bandwidth, API calls, immutable retention and notification providers may incur charges. No provider is assumed to offer unlimited free storage.

Transactional backup email via Resend is planned, not implemented. Before enabling it, configure a verified sender/domain, secret server-side API key, rate limits, deduplication, retry and sensitive-metadata filtering. Verify the provider's current free allowance rather than hardcoding it into product promises.
