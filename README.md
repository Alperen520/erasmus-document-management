# Erasmus Document Management System

A web application that digitizes and streamlines the document workflow for Erasmus+ mobility programs. Coordinators create mobility records, students upload the required documents, and the system enforces the correct approval order — locking "after-return" documents until every "before-departure" document has been approved.

Built as a full-stack Node.js project with server-side rendering, role-based access control, secure file uploads, and an audit log.

> Originally developed for a university Erasmus office (Turkish UI). Personal data and the live database are intentionally excluded from this repository.

## Features

- **Three roles** — Admin, Coordinator, and Student, each with a dedicated dashboard and permissions.
- **Mobility management** — Coordinators create mobilities (Student Study/Traineeship, Staff Teaching/Training); document checklists are auto-populated per mobility type from a central config.
- **Ordered document workflow** — "Before departure" documents lock the "after return" group; students cannot upload the second stage until the first is fully approved.
- **Secure file uploads** — PDF/JPG/PNG only, size-limited (Multer), stored per-user outside the web root.
- **Document templates** — Coordinators mark fields on `.docx` templates; students fill a form and download the completed file.
- **Announcements** — Coordinators/admins post announcements targeted at an audience; students see the latest ones with a "NEW" badge.
- **Authentication** — Session-based login with `bcrypt`-hashed passwords; students log in with their school number, staff with their institutional e-mail.
- **Audit logging** — Unexpected errors are written to `logs/error.log`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Web framework | Express |
| Views | EJS (server-side rendering) |
| Database | SQLite (`better-sqlite3`) |
| Auth | `express-session` + `bcryptjs` |
| File uploads | `multer` |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure environment variables
cp .env.example .env      # then edit values

# 3. Seed the initial admin + coordinator accounts
npm run seed

# 4. Start the server
npm start                 # http://localhost:1904
```

### Default seed accounts

`npm run seed` creates two demo accounts. **Change these credentials before any production use.**

| Role | E-mail | Password |
|------|--------|----------|
| Admin | `admin@<school-domain>` | `Admin123!` |
| Coordinator | `koordinator@<school-domain>` | `Koordinator123!` |

## Project Structure

```
config.js          Central configuration (document templates, file rules)
server.js          Express app entry point, routing, dashboards
db/                Database schema (database.js) and seed script (seed.js)
routes/            Route handlers per role (auth, admin, coordinator, user, ...)
middleware/        Authentication / authorization guards
views/             EJS templates
public/            Static assets (CSS, client JS)
templates/         .docx document templates
utils/             Helpers, queries, audit log
```

## Security & Privacy Notes

- The SQLite database (`erasmus.db*`) and all user-uploaded files (`uploads/`) are **git-ignored** — no real personal data (student numbers, names, e-mails, documents) is ever committed.
- Secrets are read from environment variables (`.env`, also git-ignored); `config.js` only holds safe fallback placeholders.
- Passwords are stored as `bcrypt` hashes, never in plain text.

## License

Released under the MIT License. See [LICENSE](LICENSE).
