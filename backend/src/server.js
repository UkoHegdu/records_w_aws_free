require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Recordsw backend listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  API:    http://localhost:${PORT}/api/v1/...`);
});
