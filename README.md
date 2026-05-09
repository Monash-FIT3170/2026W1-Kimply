# 2026W1-Kimply
Dhruv Israni (dhruv.isr14@gmail.com)
Jeremy Lim (jeremylim.0304@gmail.com)
Owen Kolotsos (owenkolotsos@outlook.com)
Ojaswi Pandey (ojaswioj98@gmail.com)
Koby Crosby (crosbk01@gmail.com)
Tan Ee Dhing (joycetan613@gmail.com)
Trisha Bhagat  (trisha.bhagat445@gmail.com)
Layela Moyo (layelaheart@gmail.com)
Ian Nguyen (mriannguyen352@gmail.com)
Zeji Li (jarrodlizeji@gmail.com)
Ze Xiang Li (lijefferson73@gmail.com)
Benjamin Quan (scientistquan@gmail.com)
Lachlan Shi (lshi0046@student.monash.edu)
Ambrris Bushen (ambrrisb2803@gmail.com)

---

## Running with Docker

> **Windows users: you must follow the WSL2 setup section below before anything else.** Running Docker from PowerShell will cause the app to not reload when you edit files. This is a known Windows limitation, not a bug in the project.

---

## Windows Setup (WSL2) — Do This First

WSL2 (Windows Subsystem for Linux) lets you run a real Linux terminal inside Windows. Docker needs to run from inside WSL2 so that file changes you make are detected by the app instantly.

### Step 1 — Install WSL2

Open **PowerShell as Administrator** (right-click the Start menu → "Windows PowerShell (Admin)") and run:

```powershell
wsl --install
```

This installs WSL2 and Ubuntu automatically. **Restart your computer** when it finishes.

After restarting, Ubuntu will open and ask you to create a Linux username and password. Choose anything — this is just for your local Linux environment.

> If you already have WSL installed and aren't sure which version, run `wsl --status` in PowerShell. You should see `Default Version: 2`. If not, run `wsl --set-default-version 2`.

### Step 2 — Install Docker Desktop

Download and install [Docker Desktop](https://www.docker.com/get-started/).

Once installed, open Docker Desktop, go to **Settings → Resources → WSL Integration**, and make sure:
- "Enable integration with my default WSL distro" is **turned on**
- Ubuntu (or your distro) is **toggled on**

Click **Apply & Restart**.

### Step 3 — Open an Ubuntu terminal

Click the Start menu and search for **Ubuntu**. Open it. You'll get a Linux terminal that looks like:

```
yourusername@DESKTOP-XXXXX:~$
```

**All commands from this point forward go into this Ubuntu terminal — not PowerShell.**

### Step 4 — Clone the repo inside WSL2

In your Ubuntu terminal, run:

```bash
cd ~
git clone <your-repo-url> 2026W1-Kimply
cd 2026W1-Kimply
```

> **Important:** the project must live inside the WSL2 filesystem (`~/...`), not on your Windows drive (`/mnt/c/...`). If you clone into `/mnt/c/Users/...` file watching will not work.

### Step 5 — Open in VS Code

Install [VS Code](https://code.visualstudio.com/) on Windows if you haven't already. Then in your Ubuntu terminal run:

```bash
code .
```

The first time you run this, VS Code will automatically install the **WSL extension** and reopen the project connected to WSL2. You'll see **WSL: Ubuntu** in the bottom-left corner of VS Code. All file edits you make in VS Code will now live inside WSL2.

---

## Starting the App

Once you're set up with WSL2, always run Docker commands from your **Ubuntu terminal** (not PowerShell).

### Prerequisites

Make sure Docker Desktop is open and running in the background before continuing.

### Startup

In your Ubuntu terminal, navigate to the project if you aren't already there:

```bash
cd ~/2026W1-Kimply
```

Then start the containers:

```bash
docker compose up
```

This starts MongoDB and the Meteor dev server. Logs will stream to your terminal. Once you see:

```
App running at: http://localhost:3000
```

open your browser and go to **http://localhost:3000**.

**The first startup takes 5–15 minutes** — Meteor downloads packages and compiles the app from scratch. Subsequent starts are much faster because the build is cached.

### Making changes

Edit files normally in VS Code. Because VS Code is connected to WSL2, saving a file instantly triggers Meteor's hot reload — the browser will update automatically without you needing to refresh.

### Running in the background

```bash
docker compose up -d
```

The `-d` flag runs the containers in the background so your terminal stays free. To view logs afterwards:

```bash
docker compose logs -f          # all services
docker compose logs -f backend  # just the Meteor app
docker compose logs -f mongodb  # just MongoDB
```

### Stopping

```bash
docker compose down
```

Stops and removes containers but **preserves your data** — MongoDB data lives in a Docker volume and survives restarts.

### Rebuilding the image

If you change `Dockerfile.dev` or `entrypoint.sh`, add `--build` to force a rebuild:

```bash
docker compose up --build
```

---

## Other Useful Commands

```bash
docker ps                        # check which containers are running
docker compose restart backend   # restart just the Meteor app
docker compose down -v           # stop everything AND wipe the database
```

### Adding an npm package

Run this inside the container — do not run `npm install` directly:

```bash
docker compose exec backend meteor npm install <package-name>
```

You don't need to rebuild the image after adding a package.

### If the app can't connect to MongoDB

Make sure you don't have a local MongoDB instance already running on port 27017. Stop it or change its port.

---

## Mac / Linux

No extra setup needed. Just install [Docker Desktop](https://www.docker.com/get-started/), then from a terminal in the project root:

```bash
docker compose up
```
