// Parse CORS origins from environment variable
// Supports: "*" for all origins, or comma-separated list of origins
const parseOrigins = () => {
  const corsOrigin = process.env.CORS_ORIGIN;

  if (!corsOrigin || corsOrigin === '*') {
    return true; // Allow all origins
  }

  // If it contains comma, split into array
  if (corsOrigin.includes(',')) {
    return corsOrigin.split(',').map((origin) => origin.trim());
  }

  return corsOrigin;
};

module.exports = {
  origin: parseOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language', 'Accept-Encoding'],
};
