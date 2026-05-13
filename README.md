# TechStore

Electronics e-commerce store built with Next.js + Supabase + Stripe.

## Local Development

1. Clone repo and run `npm install`
2. Copy `.env.example` to `.env.local` and fill in your keys
3. Apply `supabase/schema.sql` in your Supabase SQL Editor
4. Run `npm run dev` — open http://localhost:3000

## Managing Products

Log in to [supabase.com](https://supabase.com) → your project → **Table Editor → products**.
Add, edit, or delete rows directly. Set `featured = true` to show on the homepage.

## Environment Variables

See `.env.example` for all required variables.

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → Add New Project → import the repo
3. Add all environment variables from `.env.example` in Vercel dashboard
4. Deploy — the site auto-deploys on every push to main

## Stripe Webhook Setup

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-site.vercel.app/api/webhook`
3. Event: `payment_intent.succeeded`
4. Copy signing secret → add as `STRIPE_WEBHOOK_SECRET` in Vercel
