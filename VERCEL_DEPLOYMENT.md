# Vercel deployment

## Project settings

- Framework preset: `Next.js`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: leave unset (Vercel uses the Next.js `.next` build metadata)
- Node.js: `20.x` or newer

## Required environment variables

Add these for Production, Preview, and Development in Vercel Project Settings:

```text
NEXT_PUBLIC_ADMIN_EMAIL
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_DATABASE_URL
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

Copy values from the local `.env.local`. Never commit that file.

## Firebase post-deployment configuration

1. Add the production Vercel domain and any custom domain under Firebase Authentication → Settings → Authorized domains.
2. Deploy `firestore.rules` to the `myapp-986be` Firebase project.
3. Confirm Email/Password authentication is enabled and the configured administrator user exists.

## Deploy

Import the Git repository in Vercel, add the environment variables, and deploy. For CLI deployment:

```powershell
npx vercel
npx vercel --prod
```
