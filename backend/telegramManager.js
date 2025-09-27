const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs").promises;
const path = require("path");

// Import functions
const readUsers = require('./userDatabase');
const keywordManager = require('./keywordManager');
const { sendNotificationToUser } = require('./index');

// Environment variable handling
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

console.log('Telegram Manager - Environment Check:');
console.log('API_ID:', apiId);
console.log('API_HASH:', apiHash ? '***' + apiHash.slice(-4) : 'Missing');

if (!apiId || !apiHash) {
    console.error('❌ Please set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables');
    console.log('⚠️  Server will start but Telegram features will be disabled');
}

const userClients = new Map();

class TelegramManager {
    async initializeUserSession(userId, sessionPath, phoneNumber, phoneCode) {
        if (!apiId || !apiHash) {
            return { success: false, error: 'Telegram API credentials not configured' };
        }

        try {
            console.log('Starting Telegram session initialization...');
            
            const stringSession = new StringSession("");
            const client = new TelegramClient(stringSession, apiId, apiHash, {
                connectionRetries: 5,
            });

            await client.start({
                phoneNumber: async () => phoneNumber,
                phoneCode: async () => phoneCode,
                onError: (err) => console.error('Telegram error:', err),
            });

            console.log('Telegram login successful!');

            // Save session
            const sessionString = client.session.save();
            await fs.writeFile(sessionPath, sessionString);

            userClients.set(userId, client);
            await this.startListening(userId, client);

            return { success: true, message: 'Logged in successfully' };
        } catch (error) {
            console.error('Telegram login error:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreUserSession(userId, sessionPath) {
        if (!apiId || !apiHash) {
            return { success: false, error: 'Telegram API credentials not configured' };
        }

        try {
            console.log(`Restoring session for user ${userId}...`);
            
            const sessionString = await fs.readFile(sessionPath, 'utf8');
            const stringSession = new StringSession(sessionString);
            const client = new TelegramClient(stringSession, apiId, apiHash, {
                connectionRetries: 5,
            });

            await client.connect();
            
            if (!await client.checkAuthorization()) {
                return { success: false, error: 'Session expired' };
            }

            userClients.set(userId, client);
            await this.startListening(userId, client);

            console.log(`Session restored for user ${userId}`);
            return { success: true, message: 'Session restored' };
        } catch (error) {
            console.error('Session restoration error:', error);
            return { success: false, error: error.message };
        }
    }

    async startListening(userId, client) {
        console.log(`Starting to listen for messages for user ${userId}...`);
        
        client.addEventHandler(async (update) => {
            try {
                if (update.className === 'UpdateNewMessage') {
                    const message = update.message;
                    
                    // Only process group/channel messages
                    if (message.peerId && 
                        (message.peerId.className === 'PeerChannel' || 
                         message.peerId.className === 'PeerChat')) {
                        
                        const keywords = await keywordManager.getUserKeywords(userId);
                        const messageText = message.message || '';
                        
                        if (keywords.length > 0 && messageText) {
                            const matchedKeywords = keywords.filter(keyword => 
                                messageText.toLowerCase().includes(keyword.toLowerCase())
                            );

                            if (matchedKeywords.length > 0) {
                                console.log(`Keyword matched for user ${userId}:`, matchedKeywords);
                                
                                const chat = await client.getEntity(message.peerId);
                                const messageData = {
                                    id: message.id,
                                    chatTitle: chat.title || 'Unknown Chat',
                                    message: messageText,
                                    timestamp: new Date(message.date * 1000).toISOString(),
                                    keywords: matchedKeywords
                                };

                                // Send notification
                                sendNotificationToUser(userId, messageData);
                                
                                // Store message
                                await this.storeDetectedMessage(userId, messageData);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
    }

    async storeDetectedMessage(userId, messageData) {
        try {
            const messagesDir = path.join(process.cwd(), 'detected-messages');
            try {
                await fs.access(messagesDir);
            } catch {
                await fs.mkdir(messagesDir, { recursive: true });
            }

            const messagesFile = path.join(messagesDir, `${userId}.json`);
            let messages = [];
            
            try {
                const data = await fs.readFile(messagesFile, 'utf8');
                messages = JSON.parse(data);
            } catch {
                // File doesn't exist yet
            }

            messages.unshift(messageData);
            // Keep only last 1000 messages
            if (messages.length > 1000) messages = messages.slice(0, 1000);
            
            await fs.writeFile(messagesFile, JSON.stringify(messages, null, 2));
            console.log(`Message stored for user ${userId}`);
        } catch (error) {
            console.error('Error storing message:', error);
        }
    }

    async getDetectedMessages(userId) {
        try {
            const messagesFile = path.join(process.cwd(), 'detected-messages', `${userId}.json`);
            const data = await fs.readFile(messagesFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async initializeAllSessions() {
        if (!apiId || !apiHash) {
            console.log('⚠️  Skipping session initialization - Telegram API credentials missing');
            return;
        }

        console.log('Initializing all user sessions...');
        const users = await readUsers();
        
        for (const user of users) {
            if (user.telegramSessionFile && user.telegramConnected) {
                try {
                    await this.restoreUserSession(user.id, user.telegramSessionFile);
                    console.log(`✅ Restored session for user ${user.email}`);
                } catch (error) {
                    console.error(`❌ Failed to restore session for ${user.email}:`, error);
                }
            }
        }
    }

    // Method to get client for a user
    getClient(userId) {
        return userClients.get(userId);
    }

    // Method to check if user is connected
    isUserConnected(userId) {
        return userClients.has(userId);
    }

    // Method to check if Telegram is configured
    isConfigured() {
        return !!(apiId && apiHash);
    }
}

module.exports = new TelegramManager();