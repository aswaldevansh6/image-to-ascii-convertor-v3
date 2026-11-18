require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, initializeDatabase } = require("./db");
const { requireAuth } = require("./auth");

const app = express();
const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}
const origins = (process.env.FRONTEND_URL || "").split(",").map(x => x.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    if (!origin || origins.length === 0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "Smart ASCII Studio API" }));
const tokenFor = user => jwt.sign({ email: user.email }, process.env.JWT_SECRET, { subject: String(user.id), expiresIn: "7d" });

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Name must be 2–100 characters." });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 255) return res.status(400).json({ error: "Enter a valid email." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Password must be 8–72 characters." });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,created_at",
      [name, email, hash]
    );
    const user = result.rows[0];
    res.status(201).json({ message: "Account created.", token: tokenFor(user), user });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT id,name,email,password_hash,created_at FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Incorrect email or password." });
    res.json({
      message: "Login successful.", token: tokenFor(user),
      user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at }
    });
  } catch (err) { next(err); }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id,name,email,created_at FROM users WHERE id=$1", [req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

app.post("/api/conversions", requireAuth, async (req, res, next) => {
  try {
    const title = String(req.body.title || "Untitled conversion").trim().slice(0, 180) || "Untitled conversion";
    const asciiText = req.body.asciiText;
    const settings = req.body.settings && typeof req.body.settings === "object" ? req.body.settings : {};
    if (typeof asciiText !== "string" || !asciiText.length) return res.status(400).json({ error: "ASCII output is required." });
    if (asciiText.length > 500000) return res.status(413).json({ error: "Output exceeds 500,000 characters." });
    const result = await pool.query(
      "INSERT INTO conversions(user_id,title,ascii_text,settings) VALUES($1,$2,$3,$4::jsonb) RETURNING id,title,settings,created_at",
      [req.user.id, title, asciiText, JSON.stringify(settings)]
    );
    res.status(201).json({ message: "Conversion saved.", conversion: result.rows[0] });
  } catch (err) { next(err); }
});

app.get("/api/conversions", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,title,settings,created_at,LEFT(ascii_text,240) AS preview FROM conversions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ conversions: result.rows });
  } catch (err) { next(err); }
});

app.get("/api/conversions/:id", requireAuth, async (req, res, next) => {
  try {
    if (!/^\\d+$/.test(req.params.id)) return res.status(400).json({ error: "Invalid conversion ID." });
    const result = await pool.query(
      "SELECT id,title,ascii_text,settings,created_at FROM conversions WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Conversion not found." });
    res.json({ conversion: result.rows[0] });
  } catch (err) { next(err); }
});

app.delete("/api/conversions/:id", requireAuth, async (req, res, next) => {
  try {
    if (!/^\\d+$/.test(req.params.id)) return res.status(400).json({ error: "Invalid conversion ID." });
    const result = await pool.query("DELETE FROM conversions WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Conversion not found." });
    res.json({ message: "Conversion deleted." });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.message === "Origin not allowed" ? 403 : 500)
    .json({ error: err.message === "Origin not allowed" ? err.message : "Something went wrong on the server." });
});

initializeDatabase().then(() => {
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
