require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { auth, incidents, notifications, users, analytics } = require('./routes/misc');
const changes = require('./routes/changes');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: needed for correct client IPs / rate limiting
app.use(helmet());

// CORS: restrict to the deployed frontend origin(s) via CORS_ORIGIN (comma-separated); open only in local dev.
const origins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
app.use(express.json({ limit: '100kb' }));

// Brute-force protection on login: 10 attempts / 15 min per IP (disabled under test)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', auth);
app.use('/api/changes', changes);
app.use('/api/incidents', incidents);
app.use('/api/notifications', notifications);
app.use('/api/users', users);
app.use('/api/analytics', analytics);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) app.listen(PORT, () => console.log(`CMTS API on :${PORT}`));
module.exports = app;
