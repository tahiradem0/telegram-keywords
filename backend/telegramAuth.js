require('dotenv').config();
const { Api } = require("telegram"); // add this at the top
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs").promises;

const apiId = 21963031; // convert to number
const apiHash = "6fc7bbf94417d445f358eac2de624be5";          // string

class TelegramAuth {
    constructor() {
        this.pendingClients = new Map();
        console.log('TelegramAuth initialized with API_ID:', apiId);
    }

    async requestCode(userId, phoneNumber) {
    let client;
    try {
        console.log(`[TelegramAuth] Requesting code for ${phoneNumber}`);
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            throw new Error('Phone number is not defined or invalid type');
        }

        if (!apiId || !apiHash) {
            throw new Error('Telegram API credentials not configured');
        }

        const stringSession = new StringSession("");
        client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 3 });

        console.log('[TelegramAuth] Connecting to Telegram...');
        await client.connect();
        console.log('[TelegramAuth] Connected successfully');

        console.log('[TelegramAuth] Sending code request...');
        const sendCodeResult = await client.invoke(
            new Api.auth.SendCode({
                phoneNumber: phoneNumber,
                apiId: apiId,
                apiHash: apiHash,
                settings: new Api.CodeSettings({}),
            })
        );

        console.log('[TelegramAuth] Code sent successfully');

        // Save client and phoneCodeHash AFTER we have sendCodeResult
        this.pendingClients.set(userId, {
            client,
            phoneNumber,
            phoneCodeHash: sendCodeResult.phoneCodeHash,
            requestedAt: new Date(),
        });

        return {
            success: true,
            message: 'Verification code sent successfully! Check your Telegram app.',
            phoneCodeHash: sendCodeResult.phoneCodeHash,
            timeout: sendCodeResult.timeout
        };

    } catch (error) {
        console.error('[TelegramAuth] Error:', error);

        if (client) await client.disconnect().catch(console.error);
        this.pendingClients.delete(userId);

        return { success: false, error: this.parseError(error) };
    }
}


    async verifyCode(userId, code, sessionPath) {
    try {
        const pending = this.pendingClients.get(userId);
        if (!pending) {
            return { success: false, error: 'No pending verification found. Please request a new code.' };
        }

        const { client, phoneNumber, phoneCodeHash } = pending;

        console.log(`[TelegramAuth] Verifying code for ${phoneNumber}`);

        // ✅ Proper GramJS sign-in
        await client.invoke(
            new Api.auth.SignIn({
                phoneNumber: phoneNumber,
                phoneCodeHash: phoneCodeHash,
                phoneCode: code,
            })
        );

        console.log('[TelegramAuth] Verification successful!');

        // Save session
        const sessionString = client.session.save();
        await fs.writeFile(sessionPath, sessionString);
        console.log('[TelegramAuth] Session saved to:', sessionPath);

        // Clean up
        this.pendingClients.delete(userId);

        return {
            success: true,
            message: 'Telegram authentication successful! You can now monitor your groups.'
        };

    } catch (error) {
        console.error('[TelegramAuth] Verification error:', error);
        return {
            success: false,
            error: this.parseError(error)
        };
    }
}


    parseError(error) {
        const msg = error.toString();
        
        if (msg.includes('PHONE_NUMBER_INVALID')) return 'Invalid phone number format. Please check your phone number.';
        if (msg.includes('PHONE_CODE_INVALID')) return 'Invalid verification code. Please check the code and try again.';
        if (msg.includes('PHONE_CODE_EXPIRED')) return 'Verification code has expired. Please request a new code.';
        if (msg.includes('FLOOD_WAIT')) return 'Too many attempts. Please wait before trying again.';
        if (msg.includes('SESSION_PASSWORD_NEEDED')) return 'Two-factor authentication is enabled. This app currently does not support 2FA.';
        
        return `Telegram error: ${msg}`;
    }

    // Clean up expired verifications
    cleanupExpiredVerifications() {
        const now = new Date();
        for (const [userId, verification] of this.pendingClients.entries()) {
            // Remove verifications older than 10 minutes
            if (now - verification.requestedAt > 10 * 60 * 1000) {
                if (verification.client) {
                    verification.client.disconnect().catch(console.error);
                }
                this.pendingClients.delete(userId);
                console.log(`Cleaned up expired verification for user ${userId}`);
            }
        }
    }
}

// Create singleton instance
const telegramAuth = new TelegramAuth();

// Clean up expired verifications every 5 minutes
setInterval(() => {
    telegramAuth.cleanupExpiredVerifications();
}, 5 * 60 * 1000);

module.exports = telegramAuth;