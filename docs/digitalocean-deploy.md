# DigitalOcean Deployment

Kimply can be hosted on a DigitalOcean Droplet with Docker Compose. This is the simplest fit for the GitHub Student Developer Pack DigitalOcean credit because the current app already runs as two containers: Meteor and MongoDB.

## 1. Claim the student credit

Use the GitHub Student Developer Pack to claim the DigitalOcean offer, then create a small Ubuntu Droplet. A basic shared CPU Droplet is enough for testing with friends.

## 2. Create the Droplet

Recommended starting settings:

- Image: Ubuntu LTS
- Size: the smallest shared CPU size you are comfortable with
- Authentication: SSH key
- Firewall: allow SSH `22` and app traffic `3000`

After creation, SSH in:

```bash
ssh root@YOUR_DROPLET_IP
```

## 3. Install Docker

On the Droplet:

```bash
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 4. Deploy Kimply

Clone the repo and configure production environment variables:

```bash
git clone https://github.com/Monash-FIT3170/2026W1-Kimply.git
cd 2026W1-Kimply
cp .env.production.example .env
nano .env
```

Set:

- `MONGO_PASSWORD` to a long random value.
- `ROOT_URL` to `http://YOUR_DROPLET_IP:3000` for first deployment.
- If you add a domain later, change `ROOT_URL` to `https://your-domain`.

Start production:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
```

Open:

```text
http://YOUR_DROPLET_IP:3000
```

Create a room. The host lobby invite link will now use the public Droplet URL, so another player can open that link from another device.

## 5. Updating the hosted app

From the repo directory on the Droplet:

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

MongoDB data is stored in the `mongodb_data` Docker volume and survives app rebuilds.

## Optional: use a domain

Point a DNS `A` record at the Droplet IP, update `.env`:

```bash
ROOT_URL=https://your-domain
```

Then put a reverse proxy such as Caddy or Nginx in front of the app for HTTPS. HTTPS is recommended before sharing widely.
