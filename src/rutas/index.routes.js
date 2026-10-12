const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Trender server is running' });
});

module.exports = router;