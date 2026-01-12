# 🏆 World Cup 2026 Fantasy

A fantasy football web application for the FIFA World Cup 2026, built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Squad Building**: Pick 15 players (16 in knockouts) from 48 nations
- **Stage-Based Format**: Group stage rounds + knockout stages
- **Transfers**: 2-3 free transfers per stage + mercy rule for eliminated players
- **Chips**: Wildcard, Triple Captain, Bench Boost
- **Private Leagues**: Create and join leagues with friends
- **Admin Panel**: Manage players, fixtures, results, and prices
- **Near-Live Scoring**: Updates during/after matches via API-Football

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
Create a `.env` file:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-key-change-me"
API_FOOTBALL_KEY="optional-api-key-for-live-data"
```

### 3. Initialize Database
```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Default Admin Account
- **Email**: admin@worldcupfantasy.com
- **Password**: admin123

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login/Register pages
│   ├── (dashboard)/      # Main app pages
│   │   ├── admin/        # Admin panel
│   │   ├── dashboard/    # User dashboard
│   │   ├── squad/        # Squad builder
│   │   ├── transfers/    # Transfer market
│   │   ├── leagues/      # Private leagues
│   │   └── points/       # Points breakdown
│   └── api/              # API routes
├── components/           # Reusable components
└── lib/                  # Utilities and constants
    └── wc-constants.ts   # Game rules (easy to tweak!)
```

## Admin Panel Features

- **📊 Dashboard**: Overview stats
- **🌍 Nations**: View all 48 teams
- **👥 Players**: Add/edit players and prices
- **📅 Fixtures**: Manage match schedule
- **⚽ Results**: Enter match scores and player performances
- **🔄 API Sync**: Connect to API-Football for live data

## Game Rules

### Squad
- 15 players (Group Stage) / 16 players (Knockouts)
- 11 starting + 4-5 bench
- Max 3 players from same nation
- Budget: £100m

### Transfers
- 2 free transfers per group round
- 3 free transfers per knockout stage
- **Mercy Rule**: If eliminated players > free transfers, you get extra

### Chips
- **Wildcard 1**: Available from day 1
- **Wildcard 2**: Available after Round of 32
- **Triple Captain**: Captain scores 3x
- **Bench Boost**: Bench players score

### Scoring
- Minutes played: 1-2 points
- Goals: 4-10 points (varies by position)
- Assists: 3 points
- Clean sheets: 1-4 points
- Cards: -1 to -3 points

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (Prisma ORM)
- **Auth**: JWT with httpOnly cookies
- **API**: API-Football (optional)

## License

MIT
