// server/server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

const PORT = process.env.PORT || 3000;

// Secrets (set these in Render Environment, do NOT hardcode)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-token";
const EXTENSION_TOKEN = process.env.EXTENSION_TOKEN || "change-me";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const STATUS_FILE = path.join(__dirname, "status.json");

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch (e) {
    return { enabled: false };
  }
}

function writeStatus(obj) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(obj, null, 2));
}

const app = express();

// Security headers
app.use(helmet());

// CORS (good for extension + testing)
app.use(
  cors({
    origin: "*", // tighten later (e.g., chrome-extension://<id>)
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Admin-Token", "X-Extension-Token"],
  })
);

// JSON body parsing
app.use(express.json({ limit: "1mb" }));

// Rate limit for /analyze (adjust as you like)
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limited" },
});

// Optional: a separate, stricter limiter for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAdmin(req, res, next) {
  const token = req.get("X-Admin-Token");
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

function requireExtensionToken(req, res, next) {
  const token = req.get("X-Extension-Token");
  if (!token || token !== EXTENSION_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

// Health check
app.get("/", (req, res) => {
  res.send("OK. Try GET /status or POST /status or POST /analyze");
});

// Status
app.get("/status", (req, res) => {
  res.json(readStatus());
});

app.post("/status", adminLimiter, requireAdmin, (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  writeStatus({ enabled });
  res.json({ ok: true, enabled });
});

// --- ANALYZE (uses OpenAI) ---
let client = null;
function getClient() {
  if (!client) {
    if (!OPENAI_API_KEY) {
      throw new Error("missing_openai_api_key");
    }
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

app.post("/analyze", analyzeLimiter, requireExtensionToken, async (req, res) => {
  // Enforce server toggle
  const { enabled } = readStatus();
  if (!enabled) {
    return res.status(403).json({ ok: false, error: "disabled" });
  }

  const text = (req.body && req.body.text) ? String(req.body.text) : "";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, error: "missing_text" });
  }
  if (text.length > 50_000) {
    return res.status(413).json({ ok: false, error: "text_too_large" });
  }

  try {
    const openai = getClient();

    // IMPORTANT: choose a model you actually have access to.
    // If you’re unsure, start with "gpt-4o-mini" or whatever you’ve been using successfully.
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = `
You are a privacy policy analyzer.
Given the policy text, return STRICT JSON with:
{
  "summary": string,
  "data_collected": string[],
  "data_shared_with": string[],
  "user_rights": string[],
  "risk_flags": string[],   // e.g. "shares_with_advertisers", "no_deletion_process", "broad_retention"
  "overall_risk": "low" | "medium" | "high"
}

Policy text:
"""${text}"""
`;

    // Using Responses API style
    const response = await openai.responses.create({
      model,
      input: prompt,
    });

    // Extract text output
    const out =
      response.output_text ||
      (response.output && response.output[0] && response.output[0].content && response.output[0].content[0] && response.output[0].content[0].text) ||
      "";

    // Try to parse JSON safely; if it fails, return raw
    let parsed = null;
    try {
      parsed = JSON.parse(out);
    } catch {
      // attempt to salvage JSON if model wrapped it in text
      const start = out.indexOf("{");
      const end = out.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(out.slice(start, end + 1));
        } catch {}
      }
    }

    if (!parsed) {
      return res.json({ ok: true, raw: out });
    }

    return res.json({ ok: true, result: parsed });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);

    if (msg === "missing_openai_api_key") {
      return res.status(500).json({ ok: false, error: "missing_openai_api_key" });
    }

    console.error("Analyze error:", msg);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});




