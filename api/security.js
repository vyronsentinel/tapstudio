const crypto = require("crypto");

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitStore = globalThis.__tapStudioRateLimitStore || new Map();

globalThis.__tapStudioRateLimitStore = rateLimitStore;

const clean = (value) =>
  String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const clamp = (value, limit) => clean(value).slice(0, limit);

const escapeHtml = (value) =>
  clean(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });

const sendJson = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
};

const parseBody = (request, limit = 16 * 1024) => {
  const length = Number(request.headers["content-length"] || 0);

  if (length > limit) {
    const error = new Error("Request is too large");
    error.status = 413;
    throw error;
  }

  if (!request.body || typeof request.body === "object") {
    return request.body || {};
  }

  return JSON.parse(request.body);
};

const getClientIp = (request) => {
  const forwarded = clean(request.headers["x-forwarded-for"]).split(",")[0];
  return forwarded || clean(request.headers["x-real-ip"]) || request.socket?.remoteAddress || "unknown";
};

const isAllowedOrigin = (request) => {
  const origin = clean(request.headers.origin);

  if (!origin) return true;

  const host = clean(request.headers.host);
  const allowedOrigins = clean(process.env.ALLOWED_ORIGINS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (host) {
    allowedOrigins.push(`https://${host}`, `http://${host}`);
  }

  return allowedOrigins.includes(origin);
};

const requireAllowedOrigin = (request, response) => {
  if (isAllowedOrigin(request)) return true;

  sendJson(response, 403, { error: "Request origin is not allowed" });
  return false;
};

const rateLimit = (request, response, key, limit) => {
  const now = Date.now();
  const ipHash = crypto.createHash("sha256").update(getClientIp(request)).digest("hex").slice(0, 24);
  const id = `${key}:${ipHash}`;
  const bucket = rateLimitStore.get(id) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimitStore.set(id, bucket);

  for (const [storedKey, storedBucket] of rateLimitStore) {
    if (storedBucket.resetAt <= now) rateLimitStore.delete(storedKey);
  }

  if (bucket.count <= limit) return true;

  response.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
  sendJson(response, 429, { error: "Too many requests. Please try again shortly." });
  return false;
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
const isTime = (value) => /^\d{2}:\d{2}$/.test(clean(value));
const isReasonableText = (value) => clean(value).length > 0 && !/https?:\/\/|www\./i.test(clean(value));

const hasFilledHoneypot = (body) => Boolean(clean(body?.website || body?.company || body?.url));

const verifyTurnstile = async (request, token) => {
  const secret = clean(process.env.TURNSTILE_SECRET_KEY);

  if (!secret) return true;
  if (!token) return true;

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret,
      response: clean(token),
      remoteip: getClientIp(request),
    }),
  });
  const data = await response.json().catch(() => ({}));
  return Boolean(!response.ok || data.success);
};

module.exports = {
  clean,
  clamp,
  escapeHtml,
  hasFilledHoneypot,
  isDate,
  isEmail,
  isReasonableText,
  isTime,
  parseBody,
  rateLimit,
  requireAllowedOrigin,
  sendJson,
  verifyTurnstile,
};
