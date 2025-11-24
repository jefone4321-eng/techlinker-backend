const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ["https://dynamic-bonbon-d418c6.netlify.app", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Test route
app.get('/', (req, res) => {
    console.log('✅ Root route called');
    res.json({ 
        message: 'TechLinker API is running!',
        status: 'SUCCESS - Database disabled for testing'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Healthy',
        server: 'Vercel',
        database: 'Disabled for testing'
    });
});

// Handle all other routes
app.use('*', (req, res) => {
    res.json({ 
        message: 'Route exists but database is disabled',
        path: req.originalUrl
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Export for Vercel
module.exports = app;