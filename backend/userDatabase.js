const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'userDatabase.json');

async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data).users || [];
    } catch {
        return [];
    }
}

async function writeUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2));
}

module.exports = readUsers;
module.exports.writeUsers = writeUsers;