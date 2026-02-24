# Deploy to Hetzner Cloud (CX11) with Docker

One VPS, Docker Compose, Neon DB. GitHub Actions deploys on push to `main`.

---

## 1. Hetzner account and server

1. **Sign up:** [console.hetzner.cloud](https://console.hetzner.cloud) → Create account.
2. **Create a project** (e.g. "recordsw").
3. **Add SSH key** (for your machine): Security → SSH Keys → Add your public key (`~/.ssh/id_rsa.pub` or similar). You’ll use this to log in; the same or a second key can be used for GitHub Actions.
4. **Create server:** Add Server → Location (e.g. Falkenstein) → **CX11** (€3.29/mo) → Image: **Ubuntu 24.04** → SSH key: select the one you added → Create & Buy.
5. **Note:** Server **IP** (e.g. `95.217.x.x`) and login user (usually **root**).

---

## 2. Server setup (once)

SSH in (replace with your IP and key if needed):

```bash
ssh root@YOUR_SERVER_IP
```

Install Docker and Docker Compose (plugin):

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Create app directory and clone your repo (use **your** repo URL; for private repos use a deploy key or HTTPS token):

```bash
mkdir -p ~/app
cd ~/app
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .
# Or, if private with deploy key: git clone git@github.com:YOUR_USERNAME/YOUR_REPO.git .
```

Create `.env` in `~/app` with at least (you’ll add Neon and others yourself):

```bash
nano ~/app/.env
```

Minimum for backend:

- `NEON_DB_CONNECTION_STRING` – from Neon (you said you’ll set this)
- `JWT_SECRET` – long random string
- `LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT` – Trackmania/Nadeo API
- `OCLIENT_ID`, `OCLIENT_SECRET` – Trackmania OAuth

Optional: `CRON_SECRET`, `EMAIL_USER`, `EMAIL_PASS`. See `backend/ENV.md`.

---

## 3. GitHub Secrets (for Actions deploy)

In the repo: **Settings → Secrets and variables → Actions → New repository secret.**

| Secret            | Value |
|-------------------|--------|
| `HETZNER_SSH_KEY` | **Private** SSH key that can log in to the server (e.g. content of `~/.ssh/id_rsa`). Can be the same key you use for git or a dedicated deploy key. |
| `HETZNER_HOST`    | Server IP, e.g. `95.217.x.x` (no `root@`). |
| `HETZNER_USER`    | Login user, usually `root`. |
| `ENV_FILE_B64`    | Base64 of your **full** `.env` file. On your machine: `base64 -w0 .env` (Linux) or `base64 -i .env` (macOS) and paste the result. |

So: create `.env` locally (or copy from server), fill in Neon and the rest, then `base64 -w0 .env` (or macOS equivalent) and put that string in `ENV_FILE_B64`.

---

## 4. Deploy

- **Automatic:** Push to `main` → workflow runs and deploys (pulls on server, writes `.env` from `ENV_FILE_B64`, runs `deploy/deploy.sh`).
- **Manual:** Actions → “Deploy to Hetzner” → Run workflow.

First run on the server will build images and start containers. App is at **http://YOUR_SERVER_IP/** (port 80). API is same-origin (`/api/...`).

---

## 5. Optional: deploy without GitHub (manual on server)

```bash
ssh root@YOUR_SERVER_IP
cd ~/app
git pull
./deploy/deploy.sh
```

Ensure `~/app/.env` exists and is correct.

---

## Files involved

- `compose.prod.yaml` – backend + frontend + Caddy reverse proxy (ports 80, 443; auto HTTPS).
- `deploy/Caddyfile` – Caddy routes `/api` and `/health` to backend, `/` to frontend.
- `deploy/deploy.sh` – on server: `docker compose -f compose.prod.yaml up -d --build`.
- `.github/workflows/deploy-hetzner.yml` – on push to `main`: write `.env` from `ENV_FILE_B64`, SSH, pull, run `deploy/deploy.sh`.

Neon: create project and DB, run `backend/sql/init.sql` in Neon’s SQL editor, then put the connection string in `.env` and in `ENV_FILE_B64` as above.
