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

### Startup

Open a terminal (Terminal on Mac, PowerShell on Windows) and navigate to the repo root:

```bash
cd 2026W1-Kimply
ls
```

You should see `docker-compose.yml` in the output.

Then start the containers:

```bash
docker compose up
```

Starts MongoDB and the Meteor dev server. Logs stream to your terminal. The app is available at http://localhost:3000.

The first startup takes several minutes — Meteor downloads packages and compiles the app. Subsequent starts are much faster thanks to the cached `.meteor/local` volume.

### Opening in VS Code

Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers), then open the Command Palette (`Ctrl+Shift+P`) and run **Dev Containers: Attach to Running Container** and select the backend container.

### Running in the background

```bash
docker compose up -d
```

The `-d` (detached) flag runs containers in the background so your terminal stays free. To view logs afterwards:

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

If you've made changes to `Dockerfile.dev` or `entrypoint.sh`, add `--build` to force a rebuild:

```bash
docker compose up --build
```

### Other useful commands

```bash
docker ps                        # check which containers are running
docker compose restart backend   # restart just the Meteor app (e.g. after env var changes)
docker compose down -v           # stop everything AND delete all volumes (wipes the database)
```

### Notes

- If you add an npm package (`meteor npm install <pkg>`), you don't need to rebuild the image — just restart the backend container.
- If the app can't connect to MongoDB, check that you don't have a local MongoDB instance already running on port 27017.
