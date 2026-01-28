# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NovelVerse is a full-stack web novel platform built with Next.js 16 where users can read and write serialized fiction with AI-powered image generation. It supports three user roles: USER (readers), AUTHOR (writers), and ADMIN.

## Development Commands

```bash
npm run dev          # Start development server at http://localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
```

**Database (Prisma):**
```bash
npx prisma generate              # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create and apply a new migration
npx prisma studio                # Visual database browser at http://localhost:5555
```

## Architecture

### Tech Stack
- **Framework:** Next.js 16 with App Router, React 19, TypeScript
- **Database:** PostgreSQL via Prisma ORM 7 (hosted on Supabase)
- **Auth:** NextAuth v5 (beta) with Google OAuth and email/password
- **Styling:** Tailwind CSS 4
- **Rich Text:** TipTap editor
- **AI Images:** Stability AI API

### Route Groups
The app uses Next.js route groups to organize pages by user intent:
- `(auth)/` - Login and registration pages
- `(read)/` - Reader-facing pages (browse novels, read chapters)
- `(write)/` - Author dashboard and content management

### Key Directories
- `src/app/api/` - REST API endpoints
- `src/components/ui/` - Base UI components (Button, Input, Card, Modal, Badge)
- `src/components/editor/` - TipTap-based chapter editor and AI image generator
- `src/lib/` - Shared utilities: `prisma.ts` (DB client), `auth.ts` (NextAuth config), `supabase.ts` (storage client)
- `src/generated/prisma/` - Auto-generated Prisma client (do not edit manually)

### Path Alias
`@/*` maps to `src/*` - use imports like `@/lib/prisma` or `@/components/ui/Button`

### Database Models
Core models in `prisma/schema.prisma`:
- **User** - Authentication (NextAuth compatible) with role-based access
- **Novel** - Web novels with genre, status, cover image
- **Chapter** - Episodes with rich text content and optional AI illustrations
- **Bookmark/Like/Comment** - User interactions (Comment supports self-referencing replies)
- **Tag/TagsOnNovels** - Many-to-many tagging

### Authentication Flow
- NextAuth v5 configured in `src/lib/auth.ts` with edge-compatible config in `src/lib/auth.config.ts`
- Route protection via `src/middleware.ts`
- Session strategy: JWT
- Password hashing: bcryptjs

### Environment Variables
Required in `.env` (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - JWT signing secret
- `NEXTAUTH_URL` - Application URL
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Image storage
- `STABILITY_API_KEY` - AI image generation (optional)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth (optional)
