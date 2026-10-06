# Google sign-in

How to turn Google sign-in on, and where its one setting lives in each environment.

Google sign-in is **off until `GOOGLE_CLIENT_ID` is set**.
While it is empty the Account page shows only email and password, and `playerAccounts.googleSignIn` refuses every call with `google-disabled`.
Nothing else in the app changes, so leaving it empty is a safe default for a new environment.

## What the app does with it

The browser loads Google Identity Services, and the player gets a signed ID token from Google.
The token goes to `playerAccounts.googleSignIn`, which verifies it server-side with `google-auth-library`: signature against Google's published keys, expiry, issuer, this client ID as the audience, and `email_verified`.
Nothing the browser sends is trusted beyond that signature.

The client ID is **public**, not a secret. It is visible in the page source of every site that uses Google sign-in, which is why it sits in plain `environment` in the task definitions rather than in Secrets Manager.
There is no client secret: the browser flow never uses one.

## 1. Create the OAuth client

One client serves every environment, because it lists each origin separately.

1. In [Google Cloud Console](https://console.cloud.google.com/), pick or create a project for Kimply.
2. **Google Auth Platform → Branding**: set the app name and a support email.
   Under **Audience**, choose **External**. While the app is in **Testing** only listed test users can sign in, so publish it before real players use it.
   Kimply asks only for the default `openid email profile` scopes, which need no Google verification review.
3. **Google Auth Platform → Clients → Create client**, type **Web application**.
4. Under **Authorised JavaScript origins**, add each origin exactly, with **no trailing slash and no path**:

   | Origin | Which environment |
   |---|---|
   | `https://www.kimply.online` | Production. This is canonical; the apex forwards to it |
   | `https://kimply.online` | Production apex, for a browser that stays on it |
   | `https://dev.kimply.online` | Development |
   | `http://localhost:3000` | Local `docker compose up` |
   | `http://localhost` | Local, required by Google alongside the port |

   Local origins are `http://`, not `https://`. Google matches the scheme exactly and allows plain HTTP only for `localhost`.
   Leave **Authorised redirect URIs** empty: the button uses a popup and posts the ID token back to the page.
5. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

Saved changes can take a few minutes to apply, occasionally longer.

## 2. Set it in an environment

### ECS (dev and production)

The value lives in the task definition in this repo, which is the config surface for the ECS stack:

- `infra/ecs/task-definition.dev.json` → `dev.kimply.online`
- `infra/ecs/task-definition.prod.json` → `www.kimply.online`

Edit the `GOOGLE_CLIENT_ID` entry under `environment`:

```json
{ "name": "GOOGLE_CLIENT_ID", "value": "726520600349-example.apps.googleusercontent.com" }
```

Merge that to `dev` or `main` as usual.
`deploy/ecs-deploy.sh` registers a new task definition revision from the file and rolls the service onto it, so the change ships with the next deploy and needs no console work and no SSH.

Verify what the running task was given:

```bash
aws ecs describe-task-definition --task-definition kimply-dev \
  --query "taskDefinition.containerDefinitions[0].environment[?name=='GOOGLE_CLIENT_ID'].value" --output text
```

Or ask the app itself, which is what the browser does:

```bash
curl -s https://dev.kimply.online/ -o /dev/null -w '%{http_code}\n'   # app is up
```

then open `/account`: the Google button appears only when the server returns a client ID.

To read it from inside a running container, ECS Exec is enabled (`enableExecuteCommand`):

```bash
aws ecs execute-command --cluster kimply-dev --task <task-id> --container app \
  --interactive --command "printenv GOOGLE_CLIENT_ID"
```

### Local development

Put it in the repository-root `.env`, which is gitignored, and recreate the container:

```bash
echo 'GOOGLE_CLIENT_ID=<CLIENT_ID>' >> .env
docker compose up -d backend
docker compose exec backend printenv GOOGLE_CLIENT_ID
```

`docker-compose.yml` passes it through as `GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}`, so an unset variable simply means the feature is off.

### The EC2 instances

`docker-compose.prod.yml` and `.env.production.example` still carry the variable, so the legacy stack keeps working if someone deploys to it by hand.
Those instances no longer receive deploys; see [deployment-manual.md](deployment-manual.md).

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| No Google button on `/account` | `GOOGLE_CLIENT_ID` is empty in that environment | `aws ecs describe-task-definition` as above, or `printenv` locally |
| Button appears, popup says `origin_mismatch` | The site's origin is not on the OAuth client, or the scheme is wrong (`https://localhost:3000` instead of `http://`) | Click **see error details** on Google's error page: it names the exact origin it rejected |
| Sign-in fails with "Google sign-in failed. Please try again." | The server rejected the ID token | Look for `[playerAccounts.googleSignIn] ID token rejected:` in the task's CloudWatch log group (`/ecs/kimply-dev`), which gives the reason |
| "This account signs in with Google" on a password sign-in | The account was linked to a Google identity, which removes its password | Expected. Sign in with the Google button |

## If a Content-Security-Policy is ever added

There is none today. One would have to allow `https://accounts.google.com/gsi/client` in `script-src`, `https://accounts.google.com/gsi/` in `frame-src` and `connect-src`, and `https://accounts.google.com/gsi/style` in `style-src`.
