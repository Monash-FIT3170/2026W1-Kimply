# Stage 1: Install Meteor and build the bundle
FROM node:20 AS builder

RUN apt-get update && apt-get install -y \
    curl git python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN curl https://install.meteor.com/ | sh
ENV PATH="/root/.meteor:$PATH"
ENV METEOR_ALLOW_SUPERUSER=1

WORKDIR /app
COPY package*.json ./
COPY .meteor .meteor/
RUN meteor npm install

COPY . .
RUN meteor build --directory /build --server-only

# Stage 2: Lean production runtime
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /build/bundle .
RUN cd programs/server && npm install --production

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "main.js"]
