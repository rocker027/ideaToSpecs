import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);
const PORT = 3003;

app.get('/test', (req, res) => {
  res.json({ message: 'Test server is working!', timestamp: new Date().toISOString() });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Test endpoint: http://localhost:3003/test');
});