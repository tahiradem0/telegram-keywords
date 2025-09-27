require('dotenv').config();

console.log('=== Environment Test ===');
console.log('TELEGRAM_API_ID:', process.env.TELEGRAM_API_ID);
console.log('TELEGRAM_API_HASH:', process.env.TELEGRAM_API_HASH ? '***' + process.env.TELEGRAM_API_HASH.slice(-4) : 'MISSING');

// Test Telegram import
try {
    const { TelegramClient } = require("telegram");
    const { StringSession } = require("telegram/sessions");
    console.log('✅ Telegram imports successful');
    
    // Test client creation
    const client = new TelegramClient(new StringSession(""), 
        parseInt(process.env.TELEGRAM_API_ID), 
        process.env.TELEGRAM_API_HASH);
    console.log('✅ Telegram client created successfully');
} catch (error) {
    console.error('❌ Telegram test failed:', error);
}