'use strict';

const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const requiredEnv = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const dbSsl = process.env.DB_SSL === 'true'
  ? {
      rejectUnauthorized: true,
      ...(process.env.DB_SSL_CA ? { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') } : {})
    }
  : false;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: dbSsl,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});


app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null,
      },
    },
    strictTransportSecurity: false,
  })
);

app.use(express.json({ limit: '20kb' }));

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static('public', { extensions: ['html'] }));

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' }
});

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'feedback-website' });
});

app.post('/api/feedback', feedbackLimiter, async (req, res) => {
  const fullName = cleanString(req.body.full_name);
  const phone = cleanString(req.body.phone);
  const email = cleanString(req.body.email).toLowerCase();
  const message = cleanString(req.body.message);

  if (!fullName || !phone || !email || !message) {
    return res.status(400).json({ error: 'Please complete all fields.' });
  }
  if (fullName.length > 100 || phone.length > 20 || email.length > 100 || message.length > 5000) {
    return res.status(400).json({ error: 'One or more fields exceed the allowed length.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!/^[0-9+().\-\s]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customer_feedback (full_name, phone, email, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [fullName, phone, email, message]
    );
    return res.status(201).json({
      message: 'Thank you! Your feedback has been submitted.',
      feedback_id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Feedback insert failed:', error.message);
    return res.status(500).json({ error: 'Unable to save feedback right now. Please try again later.' });
  }
});

// Protected endpoint for the future on-premises synchronization service.
app.get('/api/sync/feedback', async (req, res) => {
  const configuredKey = process.env.SYNC_API_KEY;
  const suppliedKey = req.get('x-api-key');
  if (!configuredKey || !suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const since = req.query.since;
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  if (since && Number.isNaN(Date.parse(since))) {
    return res.status(400).json({ error: 'The since parameter must be a valid date.' });
  }

  try {
    const values = [];
    let where = '';
    if (since) {
      values.push(new Date(since).toISOString());
      where = 'WHERE updated_at > $1';
    }
    values.push(limit);
    const result = await pool.query(
      `SELECT id, full_name, phone, email, message, created_at, updated_at
       FROM customer_feedback ${where}
       ORDER BY id ASC LIMIT $${values.length}`,
      values
    );
    return res.json({ count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Feedback sync query failed:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve feedback.' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled application error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Feedback website listening on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
