const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  console.log('✅ Root route called!');
  res.json({ 
    message: 'SIMPLE SERVER WORKS!',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`✅ Simple server running on port ${PORT}`);
});

module.exports = app;