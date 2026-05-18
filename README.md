# Sage Grey Wallet Backend Assessment

A secure, ACID-compliant RESTful API built for Sage Grey featuring user onboarding and core financial wallet operations (funding, transfers, withdrawals).

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Query Builder**: KnexJS
- **Database**: PostgreSQL (Development & Production) / `pg-mem` in-memory PostgreSQL emulator (Automated Testing)
- **Validation**: Zod
- **Security**: Helmet, CORS, Express Rate Limit, Token Blacklisting, and Financial Idempotency
- **Testing**: Jest & Supertest

## Features & Architectural Highlights

- Clean layered architecture (Routes → Controllers → Services → Repositories).
- **Absolute ACID guarantees**: Utilizes PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) inside transactions to prevent double-spending and race conditions during simultaneous balance changes.
- **Deadlock immunity**: Consistent alphabetical resource locking order during peer-to-peer transfers.
- **Financial Idempotency (`X-Idempotency-Key`)**: Caches transaction execution states to prevent accidental double deductions on network retries.
- **DDoS & Brute-Force Protection**: Dual-tier IP rate limiting guarding global routes and sensitive authentication endpoints.
- **Enterprise Token Blacklisting**: Instant session invalidation preventing token reuse upon logout.
- **Automated wallet creation** upon user registration.

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL server (for local development)

### Installation

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:
   Copy `.env.example` to `.env` and replace the placeholder values with your real PostgreSQL credentials:

   ```env
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your_super_secret_jwt_key
   DATABASE_CLIENT=pg
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=your_db_username
   DATABASE_PASSWORD=your_db_password
   DATABASE_NAME=sage_grey_wallet
   ```

3. Run Database Migrations:

   ```bash
   npm run migrate
   ```

### Running Locally

To start the development server with live reload (`ts-node-dev`) and automated DB initialization:

```bash
npm run dev
```

Server will be running at: `http://localhost:3000`
Health check endpoint: `http://localhost:3000/api/v1/health`

---

## Automated Testing

The automated test suite runs completely isolated using an in-memory `pg-mem` PostgreSQL emulator, requiring zero external database configuration while perfectly matching real PostgreSQL syntax.

To execute the tests:

```bash
npm test
```

All 11 integration tests pass perfectly across auth, funding, withdrawal, transfer, logout/blacklisting, and idempotency flows.
