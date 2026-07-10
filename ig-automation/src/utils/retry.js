'use strict';
const logger = require('./logger');

async function withRetry(fn, opts = {}) {
  const { retries = 3, baseDelay = 1000, shouldRetry = () => true } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Retry ${attempt + 1}/${retries} in ${delay}ms`, { err: err.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
