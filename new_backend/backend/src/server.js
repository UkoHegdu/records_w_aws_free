require('dotenv').config();

// Prefix all console output with ISO timestamp (for Docker/log inspection)
const ts = () => new Date().toISOString();
const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
console.log = (...a) => orig.log(ts(), ...a);
console.info = (...a) => orig.info(ts(), ...a);
console.warn = (...a) => orig.warn(ts(), ...a);
console.error = (...a) => orig.error(ts(), ...a);

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Recordsw backend listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  API:    http://localhost:${PORT}/api/v1/...`);
});
