# World Cup 2026 Fantasy

A full-stack fantasy football application for the FIFA World Cup 2026. Built with Next.js, TypeScript, Prisma, and Tailwind CSS.

## Overview

This application allows users to build fantasy squads from all 48 participating nations, compete in private leagues, and earn points based on real match performances.

## Key Features

- **Squad Management** - Build a squad of 15 players (16 in knockouts) with a £100m budget
- **Stage-Based Gameplay** - Follows the tournament structure from groups through finals
- **Transfer System** - Strategic transfers with free allowances and mercy rules
- **Chips** - Wildcard, Triple Captain, and Bench Boost for tactical advantages
- **Private Leagues** - Create and join leagues with friends
- **Live Scoring** - Real-time point updates during matches via API-Football integration

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Styling | Tailwind CSS |
| Authentication | JWT with httpOnly cookies |
| Deployment | Vercel |
| Live Data | API-Football |

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Authentication pages
│   ├── (dashboard)/      # Protected app pages
│   │   ├── admin/        # Administration panel
│   │   ├── dashboard/    # User dashboard
│   │   ├── squad/        # Squad builder
│   │   ├── transfers/    # Transfer market
│   │   ├── leagues/      # League management
│   │   └── fixtures/     # Match schedule
│   └── api/              # REST API routes
├── components/           # Reusable UI components
├── hooks/                # Custom React hooks
└── lib/                  # Core utilities
    ├── wc-constants.ts   # Game rules configuration
    ├── api-football.ts   # External API client
    └── live-scoring.ts   # Points calculation engine
```

## Game Rules

### Squad Composition
- 15 players (Group Stage) / 16 players (Knockouts)
- Starting XI + 4-5 substitutes
- Maximum 3 players per nation
- Budget: £100m

### Transfers
- 2 free transfers per group round
- 3 free transfers per knockout stage
- Mercy Rule: Additional transfers granted when players are eliminated

### Chips (One-Time Use)
- **Wildcard 1** - Unlimited free transfers (available from start)
- **Wildcard 2** - Unlimited free transfers (available after Round of 32)
- **Triple Captain** - Captain earns 3x points
- **Bench Boost** - All bench players score points

### Points System
| Action | Points |
|--------|--------|
| Playing 1-59 mins | 1 |
| Playing 60+ mins | 2 |
| Goal (Forward) | 4 |
| Goal (Midfielder) | 5 |
| Goal (Defender/GK) | 6-10 |
| Assist | 3 |
| Clean Sheet (GK/DEF) | 4 |
| Clean Sheet (MID) | 1 |
| Yellow Card | -1 |
| Red Card | -3 |

## Development

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Neon serverless)

### Setup
```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Seed initial data
npx tsx prisma/seed.ts

# Start development server
npm run dev
```

## Deployment

The application is configured for deployment on Vercel with automatic builds from the main branch.

## License

MIT
