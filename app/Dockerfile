# Production image for Kimply. Built for linux/arm64 (t4g.medium Graviton) and
# pushed to ECR by commit SHA. The production host never runs a Meteor build.
#
#   docker buildx build --platform linux/arm64 -t <registry>/kimply:<sha> ./app

# ---------- Stage 1: build the Meteor production bundle ----------
FROM node:22-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV METEOR_ALLOW_SUPERUSER=1

# The npm package unpacks the toolchain into $HOME/.meteor and adds no global shim,
# so without this PATH entry every `meteor` call below exits 127.
RUN npm install -g meteor@3.4.1
ENV PATH="/root/.meteor:${PATH}"

WORKDIR /app

# devDependencies are REQUIRED: rspack.config.js pulls in postcss-loader,
# babel-loader, @babel/core and @babel/preset-react at build time, so --omit=dev
# here silently ships unprocessed Tailwind CSS.
COPY package.json package-lock.json ./
COPY .meteor .meteor/
RUN meteor npm ci

COPY . .

RUN meteor build --directory /build --server-only

# Serve the modern client to every browser. Meteor falls back to the ES5
# web.browser.legacy bundle for any user agent its modern-browsers package cannot
# identify (Facebook Messenger's iOS in-app browser is one), and that bundle is
# missing app code, so those users got a blank screen. `meteor build` has no
# --exclude-archs, so overwrite the arch instead of deleting it.
RUN set -eux; \
    cd /build/bundle/programs; \
    test -d web.browser && test -d web.browser.legacy; \
    rm -rf web.browser.legacy; \
    cp -a web.browser web.browser.legacy; \
    diff -q web.browser/program.json web.browser.legacy/program.json

# Install the bundle's server dependencies here, where a compiler exists, so the
# runtime image needs neither build tools nor npm. `npm install`, not `npm ci`:
# Meteor 3.4 emits no lockfile into the bundle and `npm ci` fails without one.
RUN cd /build/bundle/programs/server && npm install --omit=dev --no-audit --no-fund

# A Node major mismatch with the runner stage is the classic "builds fine, dies on
# boot" failure, so assert it at build time.
RUN node -e "\
const v = require('/build/bundle/star.json').nodeVersion; \
console.log('bundle expects Node ' + v); \
if (!v.startsWith('22.')) { \
  console.error('MISMATCH: runner stage is node:22 but the bundle wants ' + v); \
  process.exit(1); \
}"

# ---------- Stage 2: runtime ----------
# bookworm-slim, not alpine: the builder is glibc, and crossing to musl means any
# server dependency that needs to compile dies on an image with no compiler.
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    # Cap the heap below the container limit so a Meteor leak gets the app killed
    # and restarted rather than taking nginx and the OS down with it.
    NODE_OPTIONS=--max-old-space-size=1536

WORKDIR /app

COPY --from=builder --chown=node:node /build/bundle /app

USER node

EXPOSE 3000

# Liveness only, via node because the slim image has no curl. This must not depend
# on MongoDB, or an Atlas blip would put the container into a restart loop.
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "main.js"]
