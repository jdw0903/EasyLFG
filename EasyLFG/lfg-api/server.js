// Load environment variables first
require("dotenv").config();
console.log("DEBUG: RESEND KEY:", process.env.RESEND_API_KEY);

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");

// --- Email / feedback config ---

const resend = new Resend(process.env.RESEND_API_KEY);

const FEEDBACK_TO_EMAIL =
  process.env.FEEDBACK_TO_EMAIL || "your_email@example.com";
const FEEDBACK_FROM_EMAIL =
  process.env.FEEDBACK_FROM_EMAIL ||
  "EasyLFG Feedback <no-reply@easylfg.app>";

// --- App setup ---

const app = express();
const PORT = process.env.PORT || 4000;

// --- Security middlewares ---

// Helmet adds standard security headers.
// CSP is disabled for now to avoid breaking local dev with inline scripts/styles.
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// CORS (open for dev; restrict to your domain before going public)
const allowedOrigins = [
  "http://localhost:5500",
  "https://easylfg-1.onrender.com",   // ✅ no /index.html here
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow curl/healthchecks
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
  })
);


// --- Rate limiters ---

// General limiter (applied to all routes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Max total requests per IP in window
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Limiter for creating posts
const createPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: "Too many posts from this IP, please slow down." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Limiter for delete/report actions
const mutatePostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "Too many actions from this IP, please slow down." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Limiter for feedback submissions
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40, // 40 feedback submissions per IP per window (very generous)
  message: { error: "Too many feedback submissions, please slow down." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Apply general limiter to all routes
app.use(generalLimiter);

// --- In-memory store ---

// In-memory posts (reset when server restarts)
let posts = [];

// Simple sanitizer to trim and limit length
function sanitizeString(value, maxLength) {
  if (!value) return "";
  return String(value).trim().slice(0, maxLength);
}

// Auto-delete expired posts
function cleanupExpired() {
  const now = Date.now();
  posts = posts.filter((p) => p.expiresAt > now);
}

// Run cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

// --- Routes ---

// Health check (for uptime monitors, etc.)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// GET /posts?game=&platform=&region=
app.get("/posts", (req, res) => {
  cleanupExpired();
  const { game, platform, region } = req.query;

  let result = posts;

  if (game) {
    const q = game.toLowerCase();
    result = result.filter((p) => (p.game || "").toLowerCase().includes(q));
  }
  if (platform) {
    result = result.filter((p) => p.platform === platform);
  }
  if (region) {
    result = result.filter((p) => (p.region || "") === region);
  }

  // newest first
  result = result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // don't leak secretToken or reports in list responses
  const safe = result.map(({ secretToken, reports, ...rest }) => rest);
  res.json(safe);
});

// POST /posts
app.post("/posts", createPostLimiter, (req, res) => {
  const {
    game,
    platform,
    region,
    playstyle,
    groupSize,
    mic,
    description,
    contact,
    timeWindow,
    ttlMinutes,
    honeypot,
  } = req.body || {};

  // Honeypot spam detection: if this field is filled, likely a bot.
  if (honeypot && typeof honeypot === "string" && honeypot.trim() !== "") {
    return res.status(400).json({ error: "Invalid request." });
  }

  if (!game || !platform) {
    return res.status(400).json({ error: "game and platform are required" });
  }

  const now = Date.now();

  // Sanitize and enforce basic constraints server-side
  const safeGame = sanitizeString(game, 80);
  const safePlatform = sanitizeString(platform, 30);
  const safeRegion = sanitizeString(region, 20);
  const safePlaystyle = sanitizeString(playstyle, 50);
  const safeGroupSize = sanitizeString(groupSize, 20);
  const safeMic = sanitizeString(mic || "Preferred", 20);
  const safeDescription = sanitizeString(description, 280);
  const safeContact = sanitizeString(contact, 80);
  const safeTimeWindow = sanitizeString(timeWindow, 40);

  // TTL in minutes – default 1440 (24h), clamp between 60 and 1440
  let ttl = parseInt(ttlMinutes, 10);
  if (Number.isNaN(ttl)) ttl = 1440;
  ttl = Math.max(60, Math.min(ttl, 1440));

  const secretToken = crypto.randomBytes(16).toString("hex");

  const post = {
    id: crypto.randomUUID(),
    game: safeGame,
    platform: safePlatform,
    region: safeRegion,
    playstyle: safePlaystyle,
    groupSize: safeGroupSize,
    mic: safeMic,
    description: safeDescription,
    contact: safeContact,
    timeWindow: safeTimeWindow,
    createdAt: now,
    expiresAt: now + ttl * 60 * 1000, // TTL in ms
    secretToken,
    reports: 0,
  };

  posts.push(post);

  // return full post including secretToken so the creator can store it
  res.status(201).json(post);
});

// DELETE /posts/:id  (requires secretToken in body)
app.delete("/posts/:id", mutatePostLimiter, (req, res) => {
  const { id } = req.params;
  const { secretToken } = req.body || {};

  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Post not found" });
  }

  if (!secretToken || posts[index].secretToken !== secretToken) {
    return res.status(403).json({ error: "Invalid token" });
  }

  posts.splice(index, 1);
  res.json({ ok: true });
});

// POST /posts/:id/report  (basic abuse/report endpoint)
app.post("/posts/:id/report", mutatePostLimiter, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const post = posts.find((p) => p.id === id);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  // Increment in-memory counter – later you could log or persist this.
  post.reports = (post.reports || 0) + 1;

  console.log(`Post ${id} reported`, {
    reason: sanitizeString(reason, 120),
    reports: post.reports,
  });

  res.json({ ok: true });
});

// POST /suggest - anonymous suggestions (simple, optional)
app.post("/suggest", (req, res) => {
  const { text } = req.body || {};
  if (!text || text.length < 3) {
    return res.status(400).json({ error: "Suggestion too short" });
  }

  console.log("📩 New suggestion:", text.substring(0, 300));
  res.json({ ok: true });
});

// POST /feedback - send feedback to email via Resend (and log)
app.post("/feedback", feedbackLimiter, async (req, res) => {
  const { type, message, contact, page, url, userAgent, honeypot } =
    req.body || {};

  // Honeypot bot check
  if (honeypot && typeof honeypot === "string" && honeypot.trim() !== "") {
    return res.status(400).json({ error: "Invalid request." });
  }

  // Basic validation
  if (!message || typeof message !== "string" || message.trim().length < 3) {
    return res.status(400).json({
      error: "Message is required and must be at least 3 characters.",
    });
  }

  // Sanitize
  const safeType = sanitizeString(type || "idea", 20);
  const safeMessage = sanitizeString(message, 1000);
  const safeContact = sanitizeString(contact, 80);
  const safePage = sanitizeString(page || "unknown", 40);
  const safeUrl = sanitizeString(url, 200);
  const safeUA = sanitizeString(userAgent, 200);

  const createdAt = new Date().toISOString();
  const subject = `EasyLFG Feedback — ${safeType}`;
  const htmlBody = `
    <h2>New EasyLFG Feedback</h2>
    <p><strong>Type:</strong> ${safeType}</p>
    <p><strong>Message:</strong><br>${safeMessage.replace(/\n/g, "<br>")}</p>
    <p><strong>Contact:</strong> ${safeContact || "None provided"}</p>
    <p><strong>Page:</strong> ${safePage || "N/A"}</p>
    <p><strong>URL:</strong> ${safeUrl || "N/A"}</p>
    <p><strong>User Agent:</strong> ${safeUA || "N/A"}</p>
    <p><strong>Submitted at:</strong> ${createdAt}</p>
  `;

  // Always log a compact version server-side
  console.log("EASYLFG_FEEDBACK", {
    type: safeType,
    message: safeMessage,
    contact: safeContact,
    page: safePage,
    url: safeUrl,
    userAgent: safeUA,
    at: createdAt,
  });

  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set; feedback email not sent.");
    } else {
      await resend.emails.send({
        from: FEEDBACK_FROM_EMAIL,
        to: FEEDBACK_TO_EMAIL,
        subject,
        html: htmlBody,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error sending feedback email:", err);
    return res
      .status(500)
      .json({ error: "Could not send feedback email" });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`EasyLFG API running on http://localhost:${PORT}`);
});





