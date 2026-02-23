# paskateparks
Public directory for skateparks across PA.

## Tech stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase client (`@supabase/supabase-js`)

## Getting started
1. Install dependencies:
   - `npm install`
2. Create local env file:
   - `cp .env.example .env.local`
3. Add your Supabase credentials in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Run dev server:
   - `npm run dev`
