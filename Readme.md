# ShipIt — Self-Hosted CI/CD Server

A lightweight, self-hosted CI/CD server built from scratch using **GitHub Webhooks**, **SSH**, **PM2**, **Telegram**, and **AWS S3 + CloudFront**. Designed for real-world deployment workflows without relying on GitHub Actions or any third-party CI platform.

---

## Features at a Glance

| Feature | Tech Used |
|---|---|
| Auto-deploy on push | GitHub Webhooks + SSH |
| Smart dependency detection | Commit diff / `package.json` check |
| Deployment notifications | Telegram Bot API |
| Rollback on unhealthy deploy | Symlink-based release directories |
| Branch-based deployments | Webhook payload branch filter |
| GitHub commit status updates | Octokit REST |
| Frontend deploy to S3 + CloudFront | AWS CLI SDK + corepack |

---

## How It Works

### 1. Deploy on Push (GitHub Webhooks + SSH)

When a push event is triggered on the target branch, GitHub sends a webhook payload to the CI/CD server. The server SSHes into the remote machine, pulls the latest changes, and redeploys the application.

### 2. Smart Dependency Installation

Instead of blindly running `pnpm install` on every deploy, the server inspects **every commit in the push payload** (not just `head_commit`). If `package.json` appears in any commit's `added`, `removed`, or `modified` files, installation is marked as required. Otherwise, it's skipped entirely — keeping deploys fast.

### 3. Telegram Deployment Notifications

On deployment success or failure, a structured summary with the last few log lines is sent to a Telegram chat via a bot created through BotFather. The message includes the deployment status, branch, commit message, and relevant log tail for quick inspection.

### 4. Rollback on Unhealthy Server

After each deploy, a `/health` endpoint is hit to confirm the server is responding with a `2xx`. If unhealthy, the `current` symlink is reverted to the previous release and PM2 reloads from `ecosystem.config.js`.

**Release directory structure:**

```
Storra/
├── releases/
│   ├── 2026-05-28T18-16-41-621Z/   ← older release
│   └── 2026-05-28T18-30-19-621Z/   ← latest release
├── shared/                          ← .env, logs (shared across releases)
├── current -> releases/2026-05-28T18-30-19-621Z/  ← symlink
└── ecosystem.config.js              ← PM2 config (not inside any release)
```

- Each deploy clones the repo into a timestamped directory under `releases/`
- `current` symlink is updated to point to the new release
- `.env` lives in `shared/` and is symlinked into each release directory
- PM2 uses `ecosystem.config.js` with `current/app.js` as the entry point — so `pm2 startOrReload ecosystem.config.js` always works regardless of which release is active

### 5. Branch-Based Deployments

The webhook payload includes the ref (e.g., `refs/heads/main` or `refs/heads/test`). The server filters events by the expected branch — pushes to `test` branch trigger a test-mode deployment, `main` triggers production.

### 6. GitHub Commit Status Updates

Commit statuses (`pending`, `success`, `failure`) are set directly on the triggering commit using the **Octokit REST** library, matching the experience of GitHub Actions. Each status includes a URL linking to detailed deployment logs.

### 7. Frontend Deploy to S3 + CloudFront

For frontend repositories, the CI/CD server:

1. Detects the package manager via `package.json` (`packageManager` field) and downloads it via `corepack` if not installed
2. Conditionally installs Node.js, the package manager, and AWS CLI only if absent
3. Builds the frontend project
4. Syncs the build output to the configured S3 bucket
5. Invalidates the CloudFront cache so new assets are served immediately
6. Runs as a **spawned child process** — each event (`error`, `close`, `data`) is handled to capture the deployment context and logs

---

## Issues & Fixes

### PATH not found in SSH heredoc sessions

**Problem:** Commands like `pnpm`, `pm2`, and `node` were not found during SSH heredoc execution because they are installed in the home directory, not `/usr/bin`.

**Fix:** Explicitly export the required directories and add them to `$PATH` at the start of each SSH session before running any commands.

---

### Server crash after successful deployment

**Problem:** Even if deployment succeeded, newly introduced bugs could crash the server — leaving it in a broken state with no automated recovery.

**Fix:** Added a public `/health` endpoint. After deploy, the server polls it for a `2xx` response before confirming success. A non-`2xx` or timeout triggers an automatic rollback.

---

### No step-by-step deployment logs

**Problem:** With no granular logging, it was hard to pinpoint where a deployment failed.

**Fix:** Collected stdout from each shell command executed during deployment. The last N lines are sent via Telegram; the full log is stored in **Redis** with a 7-day TTL, accessible via the log URL in the commit status.

---

### Shell variable scope with `execCommand()`

**Problem:** Shell variables set in one `execCommand()` call were lost in subsequent calls because each invocation spawns a new shell process.

**Fix:** Captured command output via `stdout` and stored results in Node.js variables, passing them explicitly between steps.

---

### NVM breaks in non-interactive SSH sessions

**Problem:** NVM sets up `node`, `pnpm`, and `pm2` via shell profile scripts that only run in interactive sessions. In non-interactive SSH, these paths are unavailable — causing `command not found` errors.

**Fix:** Migrated from NVM to direct binary installations of Node.js, pnpm, and PM2 under `/usr/local/bin` — a system-wide path available in all session types.

---

### PM2 process path mismatch across releases

**Problem:** `pm2 start releases/v1/app.js --name server` hardcodes the path. When a new release lands at `releases/v2/app.js`, PM2 reloads the wrong (or non-existent) file.

**Fix:** `ecosystem.config.js` references `current/app.js` — the `current` symlink always points to the active release. Running `pm2 startOrReload ecosystem.config.js` from the project root works correctly for every release without any path changes.

---

### Octokit `repo` parameter includes owner prefix

**Problem:** Passing `"Raqibreyaz/Storra"` as the repo name to Octokit throws a "repo not found" error because it expects only the repository name.

**Fix:**
```js
const [owner, repoName] = repo.split('/');
```

---

### Log collision for same `deliveryId` across frontend and backend

**Problem:** When both frontend and backend are deployed from the same push event, they share the same `deliveryId` — causing their logs to overwrite each other in Redis.

**Fix:** Append a suffix (`-frontend` / `-backend`) to the delivery ID when storing logs, keeping each deployment's log entry unique.

---

## Tech Stack

- **Runtime:** Node.js
- **Process Manager:** PM2 (with `ecosystem.config.js`)
- **SSH:** Direct SSH execution via Node.js
- **Notifications:** Telegram Bot API (BotFather)
- **Commit Status:** Octokit REST (`@octokit/rest`)
- **Frontend Hosting:** AWS S3 + CloudFront
- **Log Storage:** Redis (7-day TTL)
- **Package Manager:** pnpm (via corepack)

---

## Directory Structure

```
Storra/                         ← project root on remote server
├── releases/                   ← all versioned deploys
│   └── <ISO-timestamp>/        ← individual release clone
├── shared/
│   ├── .env                    ← shared environment variables
│   └── logs/                   ← shared log directory
├── current -> releases/<latest> ← symlink to active release
└── ecosystem.config.js         ← PM2 config referencing current/
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | Secret to validate webhook payloads |
| `SSH_HOST` | Remote server hostname/IP |
| `SSH_USER` | SSH username |
| `SSH_PRIVATE_KEY` | Private key for SSH authentication |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | Target chat ID for notifications |
| `GITHUB_TOKEN` | Token for Octokit commit status updates |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 sync |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 sync |
| `S3_BUCKET` | Target S3 bucket for frontend builds |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution to invalidate |
| `REDIS_URL` | Redis connection string for log storage |
