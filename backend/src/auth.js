
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Please log in to continue."
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: payload.sub,
      email: payload.email
    };

    next();
  } catch {
    return res.status(401).json({
      error: "Session invalid or expired. Please log in again."
    });
  }
}

module.exports = { requireAuth };
