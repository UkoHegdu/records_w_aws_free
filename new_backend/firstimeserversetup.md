# First-time server setup (Hetzner)

Run these on a fresh server after you SSH in (e.g. `ssh recordsw` or `ssh root@89.167.40.199`). Use this if the server is recreated.

---

## 1. Install Docker and Docker Compose plugin

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**What `install -m 0755 -d /etc/apt/keyrings` does:** Creates the directory `/etc/apt/keyrings` with permissions `0755` (owner rwx, group and others rx). Apt uses this path for repository signing keys (modern key storage). The `-d` means “create directory”; `-m 0755` sets the mode.

---

## 2. Create app dir and clone repo (hetzner branch)

```bash
mkdir -p ~/app
cd ~/app
git clone -b hetzner https://github.com/UkoHegdu/recordsw.git .
```

---

## 3. Create `.env`

```bash
nano ~/app/.env
```

Add at least: `NEON_DB_CONNECTION_STRING`, `JWT_SECRET`, and the Trackmania API vars (`LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT`, `OCLIENT_ID`, `OCLIENT_SECRET`). Optional: `CRON_SECRET` (for daily cron), `EMAIL_USER`, `EMAIL_PASS`. See `backend/ENV.md`. Save: Ctrl+O, Enter, Ctrl+X.

You do **not** need `VITE_BACKEND_URL` in this `.env`: production uses `compose.prod.yaml`, which builds the frontend with same-origin (`VITE_BACKEND_URL=""`) so the app calls `/api` on the same host.

---

## 4. Deploy

```bash
cd ~/app
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

After `git pull`, the script may lose the execute bit. Either run `chmod +x deploy/deploy.sh` again or use `bash deploy/deploy.sh`.

App will be at **http://YOUR_SERVER_IP/** (port 80).

---

## 5. Daily cron (scheduler)

The daily job (mapper alerts, driver notifications, email send) runs only when something calls `POST /api/v1/cron/daily`. On the server, use a crontab so it runs once per day.

1. Ensure **CRON_SECRET** is set in `~/app/.env` (same value the backend uses).
2. Make the script executable and add a crontab line:

```bash
chmod +x ~/app/deploy/cron-daily.sh
crontab -e
```

Add one line (runs at 06:00 server time; change the time if you like):

```
0 6 * * * /root/app/deploy/cron-daily.sh
```

If the app lives elsewhere (e.g. `/home/user/app`), use that path. To test without waiting for cron: `cd ~/app && ./deploy/cron-daily.sh`.

---

## Optional: SSH config on your machine

Add to `~/.ssh/config` so you can run `ssh recordsw`:

```
Host recordsw
  HostName 89.167.40.199
  User root
```

(Update the IP if the server gets a new one.)
