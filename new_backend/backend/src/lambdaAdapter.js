/**
 * Adapts Express req/res to Lambda-style event/context and invokes the handler.
 * Handlers return { statusCode, headers, body }; we forward that to the response.
 */
function buildEvent(req) {
  const headers = {};
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers[k] = v;
    }
  }
  return {
    body: req.body !== undefined
      ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}))
      : undefined,
    queryStringParameters: req.query && Object.keys(req.query).length ? req.query : undefined,
    pathParameters: req.params && Object.keys(req.params).length ? req.params : undefined,
    headers,
    httpMethod: req.method,
    requestContext: {
      identity: {
        sourceIp: req.ip || req.connection?.remoteAddress || 'unknown'
      }
    }
  };
}

async function invokeLambda(handler, req, res) {
  const event = buildEvent(req);
  const context = {};

  try {
    const result = await handler(event, context);
    const statusCode = result.statusCode || 200;
    const resultHeaders = result.headers || {};
    Object.keys(resultHeaders).forEach(key => res.setHeader(key, resultHeaders[key]));
    res.status(statusCode);
    if (result.body && typeof result.body === 'string') {
      const contentType = resultHeaders['Content-Type'] || resultHeaders['content-type'];
      if (contentType && contentType.includes('application/json')) {
        res.send(result.body);
      } else {
        res.send(result.body);
      }
    } else {
      res.end();
    }
  } catch (err) {
    console.error('Lambda handler error:', err);
    res.status(500).json({ msg: 'Internal server error' });
  }
}

module.exports = { buildEvent, invokeLambda };
