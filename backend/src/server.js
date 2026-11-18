
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
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Smart ASCII Studio API is running" });
});

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET,
      { subject: String(user.id), expiresIn: "7d" }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already registered." });
    }
    console.error(error);
    res.status(500).json({ error: "Registration failed." });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET,
      { subject: String(user.id), expiresIn: "7d" }
    );

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed." });
  }
});

// Current logged-in user
app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not fetch user." });
  }
});

// Save a conversion
app.post("/api/conversions", requireAuth, async (req, res) => {
  try {
    const { title, asciiText, settings = {} } = req.body;

    if (typeof asciiText !== "string" || !asciiText.trim()) {
      return res.status(400).json({ error: "ASCII text is required." });
    }

    const result = await pool.query(
      `INSERT INTO conversions (user_id, title, ascii_text, settings)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, settings, created_at`,
      [
        req.user.id,
        (title || "Untitled conversion").slice(0, 180),
        asciiText,
        JSON.stringify(settings)
      ]
    );

    res.status(201).json({ conversion: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save conversion." });
  }
});

// Get this user's conversion history
app.get("/api/conversions", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, settings, created_at
       FROM conversions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({ conversions: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load history." });
  }
});

// Get one saved conversion
app.get("/api/conversions/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, ascii_text, settings, created_at
       FROM conversions
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Conversion not found." });
    }

    res.json({ conversion: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load conversion." });
  }
});

// Delete one saved conversion
app.delete("/api/conversions/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM conversions WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Conversion not found." });
    }

    res.json({ message: "Conversion deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete conversion." });
  }
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Smart ASCII Studio API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
