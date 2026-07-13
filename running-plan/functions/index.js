const functions = require("firebase-functions");
const { createApiApp } = require("./apiApp");

// Hosting rewrites /api/** to this function; the Express app matches the full
// /api/* paths. Secrets come from functions env (see functions/.env or
// `firebase functions:config`).
exports.api = functions.https.onRequest(createApiApp());
