# Production image for Kimply.
#
# Built for linux/arm64 (the deployment target is a t4g.medium Graviton instance)
# and pushed to ECR by commit SHA. The production host never runs a Meteor build.
#
#   docker buildx build --platform linux/arm64 -t <registry>/kimply:<sha> ./app

# ---------- Stage 1: build the Meteor production bundle ----------
FROM node:22-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV METEOR_ALLOW_SUPERUSER=1

# Pinned. This was previously `curl https://install.meteor.com/ | sh`, which is
# unpinned, so a new Meteor release could silently change the image contents.
#
# The npm package unpacks the real toolchain into $HOME/.meteor and symlinks
# `meteor` there. It does NOT add a shim to the global npm bin, so this PATH entry
# is required - without it every `meteor` invocation below fails with exit 127.
RUN npm install -g meteor@3.4.1
ENV PATH="/root/.meteor:${PATH}"

WORKDIR /app

# Dependencies first, so this layer caches independently of source changes.
#
# `npm ci`, not `npm install`: the lockfile was already being copied and then
# ignored, which made every build non-reproducible.
#
# devDependencies are REQUIRED here. rspack.config.js pulls in postcss-loader,
# babel-loader, @babel/core and @babel/preset-react at build time. Adding
# --omit=dev to this line silently ships unprocessed Tailwind CSS.
COPY package.json package-lock.json ./
COPY .meteor .meteor/
RUN meteor npm ci

COPY . .

RUN meteor build --directory /build --server-only

# Install the bundle's own server dependencies here, in the glibc builder that has
# a compiler, so the runtime image needs neither build tools nor npm.
#
# `npm install`, not `npm ci`: Meteor 3.4 does NOT emit a lockfile into the bundle,
# and `npm ci` requires one - it fails with npm's usage dump, which is easy to
# misread as a bad flag. This is Meteor's own documented deployment step.
# Reproducibility still comes from app/package-lock.json, which pins what
# `meteor build` compiled the bundle from.
RUN cd /build/bundle/programs/server && npm install --omit=dev --no-audit --no-fund

# Fail loudly at build time if the bundle expects a different Node major than the
# runner stage below provides. A mismatch here is the classic "builds fine, dies
# on boot" failure, so assert it rather than assuming.
RUN node -e "\
const v = require('/build/bundle/star.json').nodeVersion; \
console.log('bundle expects Node ' + v); \
if (!v.startsWith('22.')) { \
  console.error('MISMATCH: runner stage is node:22 but the bundle wants ' + v); \
  process.exit(1); \
}"

# ---------- Stage 2: runtime ----------
# bookworm-slim, not alpine: the builder is glibc, and crossing to musl means any
# server dependency that ever needs to compile dies with an opaque node-gyp error
# on an image that has no compiler.
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    # Cap the heap below the container limit so a Meteor leak gets the app killed
    # and restarted rather than taking nginx and the OS down with it.
    NODE_OPTIONS=--max-old-space-size=1536

WORKDIR /app

# The `node` user (uid 1000) already exists in the official image.
COPY --from=builder --chown=node:node /build/bundle /app

USER node

EXPOSE 3000

# No curl in the slim image, so probe with node itself.
# Liveness only: this must not depend on MongoDB, or an Atlas blip would put the
# container into a restart loop.
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# MONGO_URL and ROOT_URL are supplied at runtime. No secret is baked into any layer.
CMD ["node", "main.js"]
