import { WebApp } from 'meteor/webapp';
import { MongoInternals } from 'meteor/mongo';

// How long a successful/failed Mongo ping is reused for. Readiness is polled by
// Docker, the deploy script and an external uptime monitor, so an uncached ping
// would turn health checking into steady load against the Atlas free tier.
const READINESS_CACHE_MS = 5000;

let lastCheckedAt = 0;
let lastResult = false;

// Bodies are deliberately fixed and minimal. These endpoints are publicly
// reachable through nginx (the deploy script validates them over HTTPS), so they
// must not leak a version, a database host, uptime or connection counts.
function send(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

if (!global._healthEndpointsInitialized) {
  global._healthEndpointsInitialized = true;

  // Liveness: the Meteor process is up and its HTTP stack responds.
  // Deliberately does NOT touch MongoDB. Docker restarts the container when this
  // fails, and an Atlas blip must not be able to cause a restart loop.
  WebApp.connectHandlers.use('/health/live', (req, res) => {
    send(res, 200, '{"status":"ok"}');
  });

  // Readiness: the app can actually serve traffic, including reaching the database.
  WebApp.connectHandlers.use('/health/ready', async (req, res) => {
    const now = Date.now();

    if (now - lastCheckedAt > READINESS_CACHE_MS) {
      try {
        await MongoInternals.defaultRemoteCollectionDriver().mongo.db.admin().command({ ping: 1 });
        lastResult = true;
      } catch (error) {
        lastResult = false;
        console.error('[health] MongoDB ping failed:', error.message);
      }
      lastCheckedAt = now;
    }

    send(res, lastResult ? 200 : 503, lastResult ? '{"status":"ready"}' : '{"status":"not-ready"}');
  });
}
