import { WebApp } from 'meteor/webapp';
import { MongoInternals } from 'meteor/mongo';

const READINESS_CACHE_MS = 5000;

let lastCheckedAt = 0;
let lastResult = false;

function send(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

if (!global._healthEndpointsInitialized) {
  global._healthEndpointsInitialized = true;

  WebApp.connectHandlers.use('/health/live', (req, res) => {
    send(res, 200, '{"status":"ok"}');
  });

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
