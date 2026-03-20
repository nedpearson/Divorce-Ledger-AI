import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, 'public');
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Add rate limiting to static assets
  const staticLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use(staticLimiter);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use('*', staticLimiter, (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}
