const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

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
        status: 'Database: DISABLED for testing'
    });
});

// Health check (no database)
app.get('/health', (req, res) => {
    console.log('✅ Health check called');
    res.json({ 
        status: 'Healthy',
        server: 'Running', 
        database: 'Disabled for testing',
        timestamp: new Date().toISOString()
    });
});

// Simple auth simulation (no database)
app.post('/api/auth/register', (req, res) => {
    console.log('✅ Register route called');
    res.json({ 
        message: 'Registration would work here',
        note: 'Database is currently disabled'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Error:', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Server started - Database DISABLED`);
});