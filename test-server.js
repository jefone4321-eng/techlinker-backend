const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    console.log('✅ TEST: Request received');
    res.json({ 
        message: 'TEST: Basic server is working!',
        status: 'SUCCESS' 
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TEST Server running on port ${PORT}`);
});