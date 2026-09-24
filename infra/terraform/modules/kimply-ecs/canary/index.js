// CloudWatch Synthetics canary for Kimply (D32, D38).
//
// Two checks, both from outside AWS's view of the service. The second only runs
// when CHECK_APEX is "true", because before cutover the apex still serves the
// old stack directly:
//   ready  - the canonical /health/ready answers 200 with {"status":"ready"},
//            which proves DNS, TLS, the ALB, a task and MongoDB Atlas together.
//   apex   - the bare domain redirects to the canonical host. GoDaddy's
//            forwarding drops paths and query strings (tested 2026-09-22), so
//            only the root is checked, and either scheme is accepted because
//            the forward may point at http:// and the ALB upgrades it.
//
// Its SuccessPercent metric drives the ECS deployment rollback alarm.

const https = require('https');
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const { READY_URL, CHECK_APEX, APEX_URL, CANONICAL_HOST } = process.env;

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error(`timed out: ${url}`)));
    req.on('error', reject);
  });
}

exports.handler = async () => {
  await synthetics.executeStep('ready', async () => {
    const res = await get(READY_URL);
    log.info(`ready: HTTP ${res.status} ${res.body}`);
    if (res.status !== 200 || !res.body.includes('"ready"')) {
      throw new Error(`${READY_URL} returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
  });

  if (CHECK_APEX !== 'true') {
    log.info('apex: skipped (CHECK_APEX is not "true")');
    return;
  }

  await synthetics.executeStep('apex', async () => {
    const res = await get(APEX_URL);
    const location = res.headers.location;
    log.info(`apex: HTTP ${res.status} -> ${location}`);
    if (![301, 302, 307, 308].includes(res.status)) {
      throw new Error(`${APEX_URL} returned HTTP ${res.status}, expected a redirect`);
    }
    let host;
    try {
      host = new URL(location).hostname;
    } catch {
      throw new Error(`${APEX_URL} redirected to an unparseable location: ${location}`);
    }
    if (host !== CANONICAL_HOST) {
      throw new Error(`${APEX_URL} redirected to ${location}, expected host ${CANONICAL_HOST}`);
    }
  });
};
