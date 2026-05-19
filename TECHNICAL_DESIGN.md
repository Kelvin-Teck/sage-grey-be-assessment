# Sage Grey Backend Assessment - Technical Design Document

## 1. System Overview

The Sage Grey Wallet Backend is a secure, ACID-compliant REST API built with Node.js, TypeScript, Express, KnexJS, and PostgreSQL. It enables user onboarding and robust financial wallet operations including account funding, peer-to-peer transfers, and withdrawals.

## 2. Architecture & Design Patterns

The application follows a clean, layered architectural pattern:

```text
[ Incoming Request ] -> [ Rate Limiter ] -> [ Router & Validation ] -> [ AuthGuard ] -> [ IdempotencyGuard ] -> [ Controller ] -> [ Service Layer ] -> [ Data Access Layer / Repo ] -> [ PostgreSQL DB ]
```

- **Presentation Layer (Controllers & Routes)**: Handles HTTP requests, response formatting, authentication checking, and strict schema validation via Zod.
- **Business Logic Layer (Services)**: Encapsulates all business rules, orchestration, and database transaction boundaries.
- **Data Access Layer (Repositories)**: Isolates direct database queries and ORM interactions using KnexJS.

## 3. Database Schema

The database relational model is normalized to maintain high data integrity.

```mermaid
erDiagram
    USERS ||--|| WALLETS : owns
    WALLETS ||--o{ TRANSACTIONS : has
    USERS {
        uuid id PK
        string email UK
        string name
        string password
        timestamp created_at
        timestamp updated_at
    }
    WALLETS {
        uuid id PK
        uuid user_id FK
        decimal balance
        string currency
        timestamp created_at
        timestamp updated_at
    }
    TRANSACTIONS {
        uuid id PK
        uuid wallet_id FK
        string type "deposit | withdrawal | transfer_in | transfer_out"
        decimal amount
        string reference UK
        string description
        uuid recipient_wallet_id FK
        string status "pending | completed | failed"
        timestamp created_at
    }
    TOKEN_BLACKLIST {
        string token_hash PK "SHA-256 hash of raw JWT"
        timestamp expires_at IDX
        timestamp created_at
    }
    IDEMPOTENCY_KEYS {
        string key PK "scoped: userId:METHOD:path:rawKey"
        string user_id IDX
        string request_path
        text response_body
        integer response_status
        string execution_status "in_progress | completed | failed"
        timestamp created_at
    }
```

## 4. Key Engineering & Security Decisions

### ACID Compliance & Race Condition Prevention

In financial applications, handling concurrent requests (e.g., double-spend attempts or simultaneous transfers) is paramount.

1. **Database Transactions (`knex.transaction`)**: Every deposit, withdrawal, or transfer is wrapped in a DB transaction ensuring that either all operations succeed or everything rolls back.
2. **Row-Level Locking (`SELECT ... FOR UPDATE`)**: When a withdrawal or transfer is initiated, the affected wallet rows are locked for update until the transaction completes. This prevents race conditions and ensures balance calculations are precisely synchronized.
3. **Deadlock Prevention**: When transferring funds between two wallets, the service sorts the wallet IDs and locks them in alphabetical order. This guarantees that two simultaneous reciprocal transfers (User A to B and User B to A) will never deadlock the database.

### Financial Idempotency (Double-Spend Immunity)

All financial mutation operations (`/fund`, `/withdraw`, `/transfer`) strictly enforce idempotency via the `X-Idempotency-Key` header.

The `IdempotencyGuard` middleware uses an atomic `INSERT` strategy (TOCTOU-safe):

1. It attempts a plain `INSERT` of an `in_progress` record for the scoped key.
2. If the insert succeeds, the request is new — it is forwarded to the service layer.
3. If the insert fails with a unique-constraint violation, a record already exists — the middleware reads the existing record and either returns the cached response (for `completed`/`failed` keys) or allows a retry (for `in_progress` keys, e.g. after a server crash).
4. The service layer finalises the record atomically inside its own `db.transaction()` using an `INSERT … ON CONFLICT DO UPDATE`, committing the cached response at the same time as the wallet balance change.

This two-level atomic design guarantees that **no concurrent duplicate request can execute a financial operation twice**, and that the idempotency record is never left in an inconsistent state after a crash.

### JWT Authentication & Session Security

- **Stateless verification**: `AuthGuard` verifies the JWT signature and reads user identity (`id`, `email`, `name`) directly from verified token claims — no per-request database lookup required.
- **Token expiry**: Configurable via `JWT_EXPIRES_IN` env variable (default `1d`; recommend `15m` in production).
- **Token blacklisting**: On logout, the SHA-256 hash of the token is stored in `token_blacklist`. Every subsequent request checks this hash, ensuring instant session invalidation. Only the hash is stored — the raw JWT is never persisted, protecting against credential exposure if the database is compromised.
- **Expired entry pruning**: `TokenBlacklistRepository.deleteExpired()` removes stale rows. Call this on a scheduled job to prevent unbounded table growth.

### Password Security

- Passwords are hashed with **bcrypt** at a configurable cost factor (`BCRYPT_ROUNDS`, OWASP minimum 12).
- A maximum input length of **72 characters** is enforced at the validator to prevent bcrypt truncation attacks.
- Error messages on failed login use identical wording for both "user not found" and "wrong password" to prevent user enumeration.

### DDoS Protection & Rate Limiting

To safeguard the financial infrastructure against brute-force attacks and automated bots, strict rate limiters (`express-rate-limit`) are enforced:

- **Global Limiter**: Protects all general API routes with a 100 requests / 15-minute window per IP.
- **Auth Limiter**: Protects sensitive onboarding and login routes (`/register`, `/login`) with a strict limit of 20 attempts / 15 minutes per IP to prevent credential stuffing.

> **Production note**: The default `express-rate-limit` store is in-memory and only works correctly for single-process deployments. For multi-pod or clustered production environments, configure a shared store such as `rate-limit-redis`.

### Secure Response Handling

- **5xx errors**: The error handler always returns a generic `"Internal Server Error"` message to the client regardless of the actual cause. The real error (with full stack trace) is logged server-side via Winston for developer diagnosis.
- **Password hash never exposed**: The `req.user` object is typed as `SafeUser` (`id`, `email`, `name` only), ensuring the bcrypt hash is structurally excluded from all API responses.
- **CORS**: Restricted to origins listed in `ALLOWED_ORIGINS` (comma-separated) in production. Open in development and test.
- **Request body size**: Limited to `10kb` to block large-payload DoS attacks.

### Twin-Record Audit Logging

When a transfer occurs, two distinct immutable transaction records are written:

- A `transfer_out` record attached to the sender's wallet.
- A `transfer_in` record attached to the recipient's wallet.

This guarantees a complete, tamper-evident audit trail for every user.

## 5. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `JWT_SECRET` | **Yes** | — | Signing secret (min 10 chars) |
| `JWT_EXPIRES_IN` | No | `1d` | JWT token lifetime (`15m` recommended for production) |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor (OWASP min: 12) |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS origins (production) |
| `DATABASE_HOST` | No | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | No | `5432` | PostgreSQL port |
| `DATABASE_USER` | No | `postgres` | PostgreSQL user |
| `DATABASE_PASSWORD` | No | `postgres` | PostgreSQL password |
| `DATABASE_NAME` | No | `sage_grey_wallet` | PostgreSQL database name |

## 6. API Specification & Endpoints

### Authentication Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Register user and auto-create NGN wallet |
| `POST` | `/api/v1/auth/login` | None | Authenticate and return Bearer token |
| `GET` | `/api/v1/auth/profile` | Bearer | Get authenticated user profile (`id`, `email`, `name`) |
| `POST` | `/api/v1/auth/logout` | Bearer | Blacklist current token |

### Wallet Endpoints

All wallet mutation endpoints require both `Authorization: Bearer <token>` and `X-Idempotency-Key: <key>` headers.

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/v1/wallet` | — | Retrieve wallet balance and paginated transaction history |
| `POST` | `/api/v1/wallet/fund` | `{ "amount": 5000 }` | Deposit funds into wallet |
| `POST` | `/api/v1/wallet/withdraw` | `{ "amount": 2000 }` | Withdraw funds from wallet |
| `POST` | `/api/v1/wallet/transfer` | `{ "recipient": "user@email.com", "amount": 1500 }` | Transfer funds to another user |

### Common Response Shape

```json
// Success
{ "status": "success", "message": "...", "data": { ... } }

// Error
{ "status": "error", "message": "...", "errors": [...] }
```
