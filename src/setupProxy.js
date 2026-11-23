const { createProxyMiddleware } = require('http-proxy-middleware');

// http-proxy@1.18.1 + ws@8.x (bundled by webpack-dev-server) write a close frame
// to the proxied socket after it has ended on teardown (node-http-proxy#1547).
// The stream itself is unaffected; HPM just logs the error. Filter that one
// known-harmless message and pass every other log through untouched.
const hpmLogProvider = (provider) => ({
  ...provider,
  error: (message, ...args) => {
    if (
      typeof message === 'string' &&
      message.includes('[HPM] WebSocket error') &&
      message.includes('ERR_STREAM_WRITE_AFTER_END')
    ) {
      return;
    }
    provider.error(message, ...args);
  },
});

const TARGET = 'https://testcustomer.air2o.net';

// The gateway allowlists the Origin header and answers 403 for anything else,
// so a dev-server request keeps its `http://localhost:3000` Origin and the
// STT socket never opens. `changeOrigin` only rewrites Host, not Origin.
const rewriteOrigin = (proxyReq) => {
  proxyReq.setHeader('Origin', TARGET);
};

module.exports = function setupProxy(app) {
  app.use(
    '/api/aira-voice',
    createProxyMiddleware({
      target: TARGET,
      changeOrigin: true,
      // Stream STT upgrades the same path to a WebSocket; forward it too.
      ws: true,
      logProvider: hpmLogProvider,
      onProxyReq: rewriteOrigin,
      onProxyReqWs: (proxyReq) => rewriteOrigin(proxyReq),
    }),
  );
};
