# Sage Grey Wallet Backend Assessment

A secure, ACID-compliant RESTful API built for Sage Grey featuring user onboarding and core financial wallet operations (funding, transfers, withdrawals).

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (v18+) |
| Language | TypeScript |
| Framework | Express.js |
| Query Builder (ORM) | KnexJS |
| Database | PostgreSQL (dev & production) / `pg-mem` (tests) |
| Validation | Zod |
| Logging | Winston |
| Testing | Jest & Supertest |

---

## Features & Architectural Highlights

- **Clean layered architecture** — Routes → Controllers → Services → Repositories.
- **ACID-compliant financial operations** — Every deposit, withdrawal, and transfer runs inside a PostgreSQL transaction with `SELECT … FOR UPDATE` row-level locks to eliminate race conditions.
- **Deadlock immunity** — Consistent alphabetical resource-locking order during peer-to-peer transfers prevents circular waits.
- **TOCTOU-safe Financial Idempotency** — `X-Idempotency-Key` is claimed atomically with a plain `INSERT` (unique-constraint collision = already claimed). The service layer commits the cached response inside the same DB transaction as the balance update, making the entire flow crash-safe.
- **JWT authentication without per-request DB lookups** — User identity (`id`, `email`, `name`) is embedded in the JWT at sign time. `AuthGuard` reads claims from the verified token directly, eliminating a round-trip on every request.
- **Hashed token blacklist** — Logged-out tokens are stored as SHA-256 hashes. The raw JWT is never persisted; only its hash is checked on every request.
- **bcrypt password hashing** — Cost factor configurable via `BCRYPT_ROUNDS` (default 12, OWASP minimum). Max password length enforced at 72 chars to prevent bcrypt truncation attacks.
- **DDoS & Brute-Force Protection** — Dual-tier IP rate limiting guarding global routes and sensitive authentication endpoints.
- **Safe error responses** — 5xx errors always return a generic message to clients; full details are logged server-side only.
- **Automatic wallet creation** on user registration.

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL server

### Installation

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables. Copy `.env.example` to `.env` and fill in your values:

   ```env
   PORT=3000
   NODE_ENV=development

   # Auth
   JWT_SECRET=your_super_secret_jwt_key_min_10_chars
   JWT_EXPIRES_IN=1d
   BCRYPT_ROUNDS=12

   # CORS (comma-separated origins — used in production)
   ALLOWED_ORIGINS=http://localhost:3000

   # Database
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

   > Migrations are **not** run automatically on server start. Always run them explicitly as a separate step.

### Running Locally

```bash
npm run dev
```

Server: `http://localhost:3000`  
Health check: `http://localhost:3000/api/v1/health`

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | — | `{ email, name, password }` | Register & auto-create wallet |
| `POST` | `/api/v1/auth/login` | — | `{ email, password }` | Login, returns Bearer token |
| `GET` | `/api/v1/auth/profile` | Bearer | — | Get user profile |
| `POST` | `/api/v1/auth/logout` | Bearer | — | Invalidate current token |

### Wallet

All mutation endpoints require `Authorization: Bearer <token>` **and** `X-Idempotency-Key: <key>`.

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/v1/wallet` | — | Balance + paginated transaction history |
| `POST` | `/api/v1/wallet/fund` | `{ "amount": 5000 }` | Fund wallet |
| `POST` | `/api/v1/wallet/withdraw` | `{ "amount": 2000 }` | Withdraw from wallet |
| `POST` | `/api/v1/wallet/transfer` | `{ "recipient": "user@email.com", "amount": 1500 }` | Transfer to another user |

#### Idempotency Key Rules

- Required on all `POST` wallet endpoints.
- Must be alphanumeric (hyphens and underscores allowed), 5–100 characters.
- Scoped per user + HTTP method + path, so the same key value is safely reusable across different operations.
- Duplicate requests with a completed key return the cached response instantly — no money moves twice.

#### Response Shape

```json
// Success
{ "status": "success", "message": "...", "data": { ... } }

// Validation / business error
{ "status": "error", "message": "...", "errors": [{ "field": "amount", "message": "..." }] }
```

---

## Automated Testing

The test suite runs fully isolated using an in-memory `pg-mem` PostgreSQL emulator — no external database required.

```bash
npm test
```

**12 integration tests** cover: registration, duplicate email rejection, login, profile retrieval, logout + token blacklisting, wallet funding, insufficient-balance withdrawal, successful withdrawal, peer-to-peer transfer, and idempotency double-spend prevention.

---

<!-- ## Known Limitations & Production Considerations

| Topic | Current State | Production Recommendation |
|---|---|---|
| **Rate limiter store** | In-memory (per-process) | Switch to `rate-limit-redis` for multi-pod/cluster deployments |
| **Token blacklist cleanup** | `deleteExpired()` method available | Schedule via a cron job or DB background worker |
| **JWT strategy** | Single long-lived access token | Add a refresh token flow with a short `JWT_EXPIRES_IN` |
| **Migrations** | Must be run manually | Wire into your CI/CD pipeline before each deployment | -->
