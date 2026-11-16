require('dotenv').config();
const { Pool } = require('pg');

// Managed Postgres (e.g. Render external URL) requires TLS; set DATABASE_SSL=true there.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cmts',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
