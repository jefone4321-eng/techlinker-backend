const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Only one simple route
app.get('/', (req, res) => {
    res.json({ 
        message: 'TEST: Server is working!',
        status: 'OK' 
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TEST Server running on port ${PORT}`);
});