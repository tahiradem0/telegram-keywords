const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();
const USERS_FILE = path.join(process.cwd(), 'userDatabase.json');

// Ensure users file exists
async function ensureUsersFile() {
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }));
    }
}

// Read users from file
async function readUsers() {
    await ensureUsersFile();
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data).users;
}

// Write users to file
async function writeUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// Signup endpoint
router.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const users = await readUsers();

        if (users.find(user => user.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            email,
            passwordHash: hashedPassword,
            telegramSessionFile: `user-sessions/${uuidv4()}.session`,
            keywords: [],
            createdAt: new Date().toISOString(),
            telegramConnected: false
        };

        users.push(newUser);
        await writeUsers(users);

        console.log(`New user created: ${email}`);
        
        res.json({ 
            success: true, 
            userId: newUser.id,
            message: 'User created successfully' 
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const users = await readUsers();
        const user = users.find(u => u.email === email);

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ 
            success: true, 
            userId: user.id,
            email: user.email 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user keywords
router.get('/keywords/:userId', async (req, res) => {
    try {
        const users = await readUsers();
        const user = users.find(u => u.id === req.params.userId);
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json({ keywords: user.keywords });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add keyword
router.post('/keywords/:userId', async (req, res) => {
    try {
        const { keyword } = req.body;
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.id === req.params.userId);
        
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
        
        if (!users[userIndex].keywords.includes(keyword)) {
            users[userIndex].keywords.push(keyword);
            await writeUsers(users);
        }
        
        res.json({ success: true, keywords: users[userIndex].keywords });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove keyword
router.delete('/keywords/:userId', async (req, res) => {
    try {
        const { keyword } = req.body;
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.id === req.params.userId);
        
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
        
        users[userIndex].keywords = users[userIndex].keywords.filter(k => k !== keyword);
        await writeUsers(users);
        
        res.json({ success: true, keywords: users[userIndex].keywords });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Telegram code request
router.post('/telegram/request-code', async (req, res) => {
    try {
        const { userId, phoneNumber } = req.body;
        
        console.log('Telegram code request received:', { userId, phoneNumber });
        
        if (!userId || !phoneNumber) {
            return res.status(400).json({ error: 'User ID and phone number are required' });
        }

        // Get user from database
        const users = await readUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Validate phone number format
        if (!phoneNumber.startsWith('+')) {
            return res.status(400).json({ error: 'Phone number must start with country code (e.g., +251)' });
        }

        // Use the TelegramAuth module
        const telegramAuth = require('./telegramAuth');
        const authResult = await telegramAuth.requestCode(userId, phoneNumber);

        if (authResult.success) {
            res.json({ 
                success: true, 
                message: authResult.message,
                note: 'Check your Telegram app or SMS for the verification code'
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: authResult.error 
            });
        }
        
    } catch (error) {
        console.error('Telegram code request error:', error);
        res.status(500).json({ error: 'Failed to request verification code: ' + error.message });
    }
});

// Telegram code verification
router.post('/telegram/verify-code', async (req, res) => {
    try {
        const { userId, phoneNumber, code } = req.body;
        
        console.log('Telegram code verification received:', { userId, phoneNumber, code });
        
        if (!userId || !phoneNumber || !code) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Get user from database
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Validate code format
        if (code.length < 5) {
            return res.status(400).json({ error: 'Verification code must be at least 5 digits' });
        }

        // Use the TelegramAuth module
        const telegramAuth = require('./telegramAuth');
        const verificationResult = await telegramAuth.verifyCode(
            userId, 
            code, 
            users[userIndex].telegramSessionFile
        );

        if (verificationResult.success) {
            // Update user's Telegram connection status
            users[userIndex].telegramConnected = true;
            users[userIndex].telegramConnectedAt = new Date().toISOString();
            await writeUsers(users);

            res.json({ 
                success: true, 
                message: 'Telegram connected successfully! You can now monitor groups for keywords.',
                user: {
                    id: userId,
                    phoneNumber: phoneNumber
                }
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: verificationResult.error || 'Verification failed' 
            });
        }
        
    } catch (error) {
        console.error('Telegram verification error:', error);
        res.status(500).json({ error: 'Failed to verify code: ' + error.message });
    }
});

// Check Telegram connection status
router.get('/telegram/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const users = await readUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            connected: !!user.telegramConnected,
            hasSessionFile: !!user.telegramSessionFile,
            connectedAt: user.telegramConnectedAt
        });
        
    } catch (error) {
        console.error('Telegram status check error:', error);
        res.status(500).json({ error: 'Failed to check Telegram status' });
    }
});

module.exports = router;