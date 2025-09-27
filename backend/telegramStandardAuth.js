// backend/telegramStandardAuth.js
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "fs/promises";

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

class TelegramStandardAuth {
    constructor() {
        this.pendingSessions = new Map();
    }

    async requestCode(userId, phoneNumber) {
        try {
            console.log(`[StandardAuth] Starting authentication for ${phoneNumber}`);
            // console.log('Received phoneNumber:', phoneNumber, 'Type:', typeof phoneNumber);
            
            const stringSession = new StringSession("");
            const client = new TelegramClient(stringSession, apiId, apiHash, {
                connectionRetries: 3,
            });

            await client.connect();
            
            // Start the authentication process
            // This will send the code automatically
            const authResult = await client.start({
                phoneNumber: async () => phoneNumber,
                phoneCode: async () => {
                    // This will be called when we verify the code
                    throw new Error('Not implemented yet - waiting for code verification');
                },
                password: async () => {
                    // Handle 2FA if needed
                    return undefined;
                },
                onError: (err) => {
                    console.error('Telegram auth error:', err);
                }
            });

            // Store the session for verification
            this.pendingSessions.set(userId, {
                client,
                phoneNumber,
                requestedAt: new Date()
            });

            return {
                success: true,
                message: 'Verification code sent successfully! Check your Telegram app.',
                note: 'The code should arrive within a few seconds.'
            };

        } catch (error) {
            console.error('[StandardAuth] Error:', error);
            
            // Check if the error indicates the code was sent
            if (error.message.includes('AUTH_RESTART') || error.message.includes('SESSION_PASSWORD_NEEDED')) {
                // The code was actually sent, but we need to handle the next step
                return {
                    success: true,
                    message: 'Verification code sent. Please enter the code to continue.',
                    requiresCode: true
                };
            }
            
            return {
                success: false,
                error: this.parseError(error)
            };
        }
    }

    async verifyCode(userId, code, sessionPath) {
        try {
            const pending = this.pendingSessions.get(userId);
            if (!pending) {
                return { success: false, error: 'No pending session found. Please restart the authentication.' };
            }

            const { client, phoneNumber } = pending;

            console.log(`[StandardAuth] Verifying code for ${phoneNumber}`);
            
            // Complete the authentication
            await client.start({
                phoneNumber: async () => phoneNumber,
                phoneCode: async () => code.toString(),
                password: async (hint) => {
                    console.log('2FA required. Hint:', hint);
                    // For now, we don't support 2FA
                    return undefined;
                },
                onError: (err) => {
                    console.error('Verification error:', err);
                }
            });

            console.log('[StandardAuth] Authentication successful!');
            
            // Save the session
            const sessionString = client.session.save();
            await fs.writeFile(sessionPath, sessionString);

            // Clean up
            this.pendingSessions.delete(userId);

            return {
                success: true,
                message: 'Telegram authentication successful! You can now monitor your groups.'
            };

        } catch (error) {
            console.error('[StandardAuth] Verification error:', error);
            return {
                success: false,
                error: this.parseError(error)
            };
        }
    }

    parseError(error) {
        const msg = error.toString();
        
        if (msg.includes('PHONE_NUMBER_INVALID')) return 'Invalid phone number format.';
        if (msg.includes('PHONE_CODE_INVALID')) return 'Invalid verification code.';
        if (msg.includes('PHONE_CODE_EXPIRED')) return 'Code has expired. Request a new one.';
        if (msg.includes('FLOOD')) return 'Too many attempts. Please wait.';
        if (msg.includes('SESSION_PASSWORD_NEEDED')) return '2FA is enabled. This app does not support 2FA yet.';
        
        return `Authentication error: ${msg}`;
    }
}

export default new TelegramStandardAuth();