# Kimply

A real-time multiplayer color-sequence memory game (like Simon Says). Players join a room via PIN, wait in a lobby, then compete through color sequences.

**Team members:**
Dhruv Israni · Jeremy Lim · Owen Kolotsos · Ojaswi Pandey · Koby Crosby · Tan Ee Dhing · Trisha Bhagat · Layela Moyo · Ian Nguyen · Zeji Li · Ze Xiang Li · Benjamin Quan · Lachlan Shi · Ambrris Bushen

---

## What you need before starting

- **Git** — to download the code. Check if you have it by running `git --version` in a terminal. If not, download it from [git-scm.com](https://git-scm.com/downloads).
- **Docker Desktop** — to run the app. Download it from [docker.com/get-started](https://www.docker.com/get-started/).
- **VS Code** (recommended) — download from [code.visualstudio.com](https://code.visualstudio.com/).

> **Windows users — stop here and read the WSL2 section below before doing anything else.** Running Docker from PowerShell will break hot reload. This is a known Windows limitation, not a bug.

---

## Windows Setup (WSL2)

WSL2 (Windows Subsystem for Linux) gives you a real Linux terminal inside Windows. You need to run everything from inside WSL2 so that file changes you make are detected by the app instantly.

### Step 1 — Install WSL2

Open **PowerShell as Administrator** (right-click the Start menu → "Windows PowerShell (Admin)") and run:

```powershell
wsl --install
```

This installs WSL2 and Ubuntu automatically. **Restart your computer** when it finishes.

After restarting, Ubuntu will open and ask you to create a Linux username and password. Choose anything — this is just for your local Linux environment.

> Already have WSL? Run `wsl --status` in PowerShell. You should see `Default Version: 2`. If not, run `wsl --set-default-version 2`.

### Step 2 — Configure Docker Desktop

Open Docker Desktop, go to **Settings → Resources → WSL Integration**, and make sure:
- "Enable integration with my default WSL distro" is **turned on**
- Ubuntu (or your distro) is **toggled on**

Click **Apply & Restart**.

### Step 3 — Open an Ubuntu terminal

Click the Start menu and search for **Ubuntu**. Open it. You'll see a prompt like:

```
yourusername@DESKTOP-XXXXX:~$
```

**All commands from this point forward go into this Ubuntu terminal — not PowerShell.**

### Step 4 — Clone the repo inside WSL2

```bash
cd ~
git clone https://github.com/Monash-FIT3170/2026W1-Kimply
cd 2026W1-Kimply
```

> **Important:** the project must live inside the WSL2 filesystem (`~/...`), not your Windows drive (`/mnt/c/...`). If you clone into `/mnt/c/Users/...` file watching will not work.

### Step 5 — Open in VS Code

In your Ubuntu terminal run:

```bash
code .
```

The first time, VS Code automatically installs the **WSL extension** and reopens the project connected to WSL2. You'll see **WSL: Ubuntu** in the bottom-left corner. All edits you make in VS Code will now live inside WSL2.

---

## Mac / Linux Setup

No special setup needed. Open a terminal, then clone the repo:

```bash
git clone https://github.com/Monash-FIT3170/2026W1-Kimply
cd 2026W1-Kimply
```

---

## Running the App

Make sure **Docker Desktop is open and running** before continuing.

In your terminal (Ubuntu terminal on Windows), navigate to the project:

```bash
cd ~/2026W1-Kimply   # Windows/WSL2
# or
cd 2026W1-Kimply     # Mac/Linux (wherever you cloned it)
```

Start the app:

```bash
docker compose up
```

This starts MongoDB and the Meteor dev server. Logs will stream to your terminal. Once you see:

```
App running at: http://localhost:3000
```

open your browser and go to **http://localhost:3000**.

> **The first startup takes 5–15 minutes.** Meteor downloads packages and compiles the app from scratch. Subsequent starts are much faster because the build is cached.

### Making changes

Edit files in VS Code. Saving a file instantly triggers Meteor's hot reload — the browser updates automatically without you needing to refresh.

### Running in the background

```bash
docker compose up -d
```

The `-d` flag runs containers in the background so your terminal stays free. To view logs afterwards:

```bash
docker compose logs -f           # all services
docker compose logs -f backend   # just the Meteor app
docker compose logs -f mongodb   # just MongoDB
```

### Stopping

```bash
docker compose down
```

Stops and removes containers but **preserves your data** — MongoDB data lives in a Docker volume and survives restarts.

### Rebuilding the image

Only needed if you change `Dockerfile.dev` or `entrypoint.sh`:

```bash
docker compose up --build
```

---

## Other Useful Commands

```bash
docker ps                         # check which containers are running
docker compose restart backend    # restart just the Meteor app
docker compose down -v            # stop everything AND wipe the database
```

### Adding an npm package

Run this inside the container — do not run `npm install` directly:

```bash
docker compose exec backend meteor npm install <package-name>
```

You don't need to rebuild the image after adding a package.

---

## Troubleshooting

**The app can't connect to MongoDB**
Make sure you don't have a local MongoDB instance already running on port 27017. Stop it or change its port.

**File changes aren't triggering a reload (Windows)**
You're probably running Docker from PowerShell or the project is cloned onto your Windows drive (`/mnt/c/...`). Follow the WSL2 setup above and clone into `~/` inside WSL2.

**`docker compose` command not found**
Make sure Docker Desktop is installed and running. On older Docker versions the command may be `docker-compose` (with a hyphen).

**Port 3000 is already in use**
Another app is using port 3000. Stop that app, or run `docker compose down` first to clean up any leftover containers.
