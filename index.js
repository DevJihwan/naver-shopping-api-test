require('dotenv').config();
const express = require('express');
const createShoppingRouter = require('./src/routes/shoppingRoutes');

// Environment variables
const PORT = process.env.PORT || 3000;
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// Check if required API credentials are provided
if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('Error: Naver API credentials are not provided. Please check your .env file.');
  process.exit(1);
}

// Create Express app
const app = express();

// Middleware
app.use(express.json());

// Routes
const shoppingRouter = createShoppingRouter(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET);
app.use('/api/shopping', shoppingRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Naver Shopping API Test Server',
    endpoints: {
      search: '/api/shopping/search?query={search_term}'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API base URL: http://localhost:${PORT}`);
  console.log(`Shopping search endpoint: http://localhost:${PORT}/api/shopping/search?query={search_term}`);
});