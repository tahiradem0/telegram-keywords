const readUsers = require('./userDatabase');

class KeywordManager {
    async getUserKeywords(userId) {
        const users = await readUsers();
        const user = users.find(u => u.id === userId);
        return user ? user.keywords : [];
    }

    async addKeyword(userId, keyword) {
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1 && !users[userIndex].keywords.includes(keyword)) {
            users[userIndex].keywords.push(keyword);
            // Note: This would need to save back to file
        }
        
        return users[userIndex]?.keywords || [];
    }

    async removeKeyword(userId, keyword) {
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1) {
            users[userIndex].keywords = users[userIndex].keywords.filter(k => k !== keyword);
        }
        
        return users[userIndex]?.keywords || [];
    }
}

module.exports = new KeywordManager();