# Daily Buddies

Daily Buddies is a playful parent/child chore companion. The backend is an Express API with Prisma + SQLite, and the mobile app is built with Expo Router + React Native.

## Features

- Parent dashboard to manage kids, assign one-off tasks, and build reusable routines
- Kid-friendly task list with streak rewards, points, and completion tracking
- Starter routines, daily streak rewards, and tone-based avatars for quick personalization

## Requirements

- Node.js 22+

## Project Structure

```
.
├── api/                 # Express API (entry: api/src/server.ts)
│   ├── src/             # Routes, middleware, services
│   ├── prisma/          # Prisma schema, migrations, seed data
│   └── tests/           # Backend unit tests (Vitest)
└── mobile/             # Expo Router app
    ├── app/(auth)/     # Login/register screens
    ├── app/(app)/      # Main parent/child screens (home, profile, tasks, family hub, etc.)
    └── src/            # Shared auth context, API client, config
```

Backend entry point: `api/src/server.ts`  
Mobile entry point: `mobile/app/_layout.tsx`

## Getting Started

```bash
git clone https://github.com/eimg/daily-buddies.git
```

```bash
# API
cd daily-buddies/api
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev         # starts the API on http://localhost:4000
```

```bash
# Mobile App
cd daily-buddies/mobile
npm install
npm start           # run Expo (press i for iOS simulator, a for Android, or scan the QR in Expo Go)
```

## API Tests

```bash
npm test
```

## Test Accounts (seed data)

| Role   | Username | Email            | Password    |
|--------|----------|------------------|-------------|
| Parent | maya     | maya@example.com | parentpass  |
| Child  | luna     | luna@example.com | lunapass    |
| Child  | theo     | (none)           | theopass    |

Use these after running `npx prisma db seed`.

## License

MIT – see [LICENSE.md](LICENSE.md).
