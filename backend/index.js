require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const authRouter = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Test environment variables
console.log('=== Server Startup ===');
console.log('TELEGRAM_API_ID:', process.env.TELEGRAM_API_ID ? 'Loaded' : 'Missing');
console.log('TELEGRAM_API_HASH:', process.env.TELEGRAM_API_HASH ? '***' + process.env.TELEGRAM_API_HASH.slice(-4) : 'Missing');
console.log('PORT:', PORT);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/auth', authRouter);

// WebSocket server
const wss = new WebSocketServer({ port: 8080 });
const userConnections = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
        userConnections.set(userId, ws);
        console.log(`User ${userId} connected via WebSocket`);
        
        ws.send(JSON.stringify({
            type: 'CONNECTED',
            message: 'WebSocket connection established'
        }));
    }

    ws.on('close', () => {
        if (userId) {
            userConnections.delete(userId);
            console.log(`User ${userId} disconnected`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Function to send notifications to specific user
function sendNotificationToUser(userId, messageData) {
    const ws = userConnections.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
            type: 'NEW_MESSAGE',
            data: messageData
        }));
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'Server is running!', 
        timestamp: new Date().toISOString(),
        usersConnected: userConnections.size,
        telegramConfigured: !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH)
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server on ws://localhost:8080`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export for use in other files
module.exports = { sendNotificationToUser };