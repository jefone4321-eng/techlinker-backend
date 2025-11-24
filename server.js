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
    res.json({ message: 'TechLinker API is running!' });
});

// Health check (no database)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Healthy',
        server: 'Running',
        database: 'Not tested'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Server started successfully`);
});