class TelegramNotifierApp {
    constructor() {
        this.userId = null;
        this.ws = null;
        this.keywords = [];
        this.phoneNumber = '';
        
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializeEventListeners() {
        // Login/Signup forms and tabs
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('signupForm').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // Tab buttons
        document.getElementById('loginTab').addEventListener('click', () => this.switchTab('login'));
        document.getElementById('signupTab').addEventListener('click', () => this.switchTab('signup'));
        
        // Keyword management
        document.getElementById('addKeywordBtn').addEventListener('click', () => this.addKeyword());
        document.getElementById('newKeyword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addKeyword();
        });
        
        // Telegram connection
        document.getElementById('connectTelegramBtn').addEventListener('click', () => this.showTelegramModal());
        document.getElementById('closeModal').addEventListener('click', () => this.hideTelegramModal());
        
        // Telegram modal buttons
        document.getElementById('sendCodeBtn').addEventListener('click', () => this.sendCode());
        document.getElementById('verifyCodeBtn').addEventListener('click', () => this.verifyCode());
        
        // Telegram modal inputs
        document.getElementById('phoneNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCode();
        });
        document.getElementById('verificationCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.verifyCode();
        });
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.form').forEach(form => form.classList.remove('active'));
        
        if (tab === 'login') {
            document.getElementById('loginTab').classList.add('active');
            document.getElementById('loginForm').classList.add('active');
        } else {
            document.getElementById('signupTab').classList.add('active');
            document.getElementById('signupForm').classList.add('active');
        }
    }

    async connectWebSocket() {
        if (this.userId) {
            try {
                this.ws = new WebSocket(`ws://localhost:8080?userId=${this.userId}`);
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected successfully');
                    this.updateTelegramStatus();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('WebSocket message received:', data);
                        
                        if (data.type === 'NEW_MESSAGE') {
                            this.showNotification(data.data);
                            this.addMessageToList(data.data);
                        } else if (data.type === 'CONNECTED') {
                            console.log('WebSocket connection confirmed');
                        }
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
                
                this.ws.onclose = () => {
                    console.log('WebSocket disconnected, attempting reconnect in 5 seconds...');
                    setTimeout(() => this.connectWebSocket(), 5000);
                };
            } catch (error) {
                console.error('WebSocket connection failed:', error);
                setTimeout(() => this.connectWebSocket(), 5000);
            }
        }
    }

    async updateTelegramStatus() {
        try {
            const response = await fetch(`/auth/telegram/status/${this.userId}`);
            if (response.ok) {
                const status = await response.json();
                const statusElement = document.querySelector('#telegramStatus span');
                if (statusElement) {
                    if (status.connected) {
                        statusElement.textContent = 'Connected to Telegram';
                        statusElement.style.color = 'green';
                    } else {
                        statusElement.textContent = 'Not connected to Telegram';
                        statusElement.style.color = 'red';
                    }
                }
            }
        } catch (error) {
            console.error('Error checking Telegram status:', error);
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;

        if (!email || !password) {
            alert('Please enter both email and password');
            return;
        }

        try {
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            
            if (data.success) {
                alert('Signup successful! Please login with your new account.');
                this.switchTab('login');
                document.getElementById('signupForm').reset();
            } else {
                throw new Error(data.error || 'Signup failed');
            }
        } catch (error) {
            alert('Signup failed: ' + error.message);
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            
            if (data.success) {
                this.userId = data.userId;
                localStorage.setItem('userId', this.userId);
                this.showDashboard();
                this.loadKeywords();
                this.connectWebSocket();
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    }

    checkExistingSession() {
        const userId = localStorage.getItem('userId');
        if (userId) {
            this.userId = userId;
            this.showDashboard();
            this.loadKeywords();
            this.connectWebSocket();
        }
    }

    showDashboard() {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('dashboardScreen').classList.add('active');
    }

    logout() {
        this.userId = null;
        localStorage.removeItem('userId');
        
        if (this.ws) {
            this.ws.close();
        }
        
        document.getElementById('dashboardScreen').classList.remove('active');
        document.getElementById('loginScreen').classList.add('active');
    }

    async loadKeywords() {
        try {
            const response = await fetch(`/auth/keywords/${this.userId}`);
            const data = await response.json();
            this.keywords = data.keywords || [];
            this.renderKeywords();
        } catch (error) {
            console.error('Error loading keywords:', error);
            this.keywords = [];
            this.renderKeywords();
        }
    }

    async addKeyword() {
        const input = document.getElementById('newKeyword');
        const keyword = input.value.trim();
        
        if (!keyword) {
            alert('Please enter a keyword');
            return;
        }
        
        try {
            const response = await fetch(`/auth/keywords/${this.userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword })
            });
            
            const data = await response.json();
            if (data.success) {
                this.keywords = data.keywords;
                this.renderKeywords();
                input.value = '';
                alert('Keyword added successfully!');
            }
        } catch (error) {
            alert('Failed to add keyword: ' + error.message);
        }
    }

    async removeKeyword(keyword) {
        try {
            const response = await fetch(`/auth/keywords/${this.userId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword })
            });
            
            const data = await response.json();
            if (data.success) {
                this.keywords = data.keywords;
                this.renderKeywords();
                alert('Keyword removed successfully!');
            }
        } catch (error) {
            alert('Failed to remove keyword: ' + error.message);
        }
    }

    renderKeywords() {
        const container = document.getElementById('keywordsList');
        container.innerHTML = this.keywords.map(keyword => `
            <div class="keyword-item">
                ${this.escapeHtml(keyword)}
                <button onclick="app.removeKeyword('${this.escapeHtml(keyword)}')">×</button>
            </div>
        `).join('');
    }

    addMessageToList(message) {
        const container = document.getElementById('messagesList');
        const messageElement = document.createElement('div');
        messageElement.className = 'message-item';
        messageElement.innerHTML = `
            <div class="message-header">
                <strong>${this.escapeHtml(message.chatTitle)}</strong>
                <span>${new Date(message.timestamp).toLocaleString()}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message.message)}</div>
            <div class="message-keywords">
                ${message.keywords.map(kw => `<span class="keyword-badge">${this.escapeHtml(kw)}</span>`).join('')}
            </div>
        `;
        
        container.insertBefore(messageElement, container.firstChild);
    }

    showNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Keyword detected in ${message.chatTitle}`, {
                body: message.message
            });
        }
    }

    showTelegramModal() {
        document.getElementById('telegramModal').style.display = 'block';
        // Reset the modal
        document.getElementById('step1').classList.add('active');
        document.getElementById('step2').classList.remove('active');
        document.getElementById('phoneNumber').value = '';
        document.getElementById('verificationCode').value = '';
    }

    hideTelegramModal() {
        document.getElementById('telegramModal').style.display = 'none';
    }

    async sendCode() {
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        
        if (!phoneNumber) {
            alert('Please enter your phone number');
            return;
        }

        if (!phoneNumber.startsWith('+')) {
            alert('Please include country code (e.g., +251 for Ethiopia)');
            return;
        }

        if (!this.userId) {
            alert('Please login first');
            return;
        }

        try {
            const button = document.getElementById('sendCodeBtn');
            button.disabled = true;
            button.textContent = 'Sending...';
            
            const response = await fetch('/auth/telegram/request-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: this.userId, 
                    phoneNumber: phoneNumber 
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.phoneNumber = phoneNumber;
                document.getElementById('step1').classList.remove('active');
                document.getElementById('step2').classList.add('active');
                alert('Code request sent! Check your Telegram app for the verification code.');
            } else {
                throw new Error(data.error || 'Failed to send code');
            }
        } catch (error) {
            alert('Error sending code: ' + error.message);
        } finally {
            const button = document.getElementById('sendCodeBtn');
            button.disabled = false;
            button.textContent = 'Send Code';
        }
    }

    async verifyCode() {
        const code = document.getElementById('verificationCode').value.trim();
        
        if (!code) {
            alert('Please enter the verification code');
            return;
        }

        if (!this.userId || !this.phoneNumber) {
            alert('Please start the verification process again');
            return;
        }

        try {
            const button = document.getElementById('verifyCodeBtn');
            button.disabled = true;
            button.textContent = 'Verifying...';
            
            const response = await fetch('/auth/telegram/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: this.userId, 
                    phoneNumber: this.phoneNumber,
                    code: code 
                })
            });

            const data = await response.json();
            
            if (data.success) {
                alert('Telegram connected successfully! You can now add keywords to monitor.');
                this.hideTelegramModal();
                this.updateTelegramStatus();
            } else {
                throw new Error(data.error || 'Verification failed');
            }
        } catch (error) {
            alert('Error verifying code: ' + error.message);
        } finally {
            const button = document.getElementById('verifyCodeBtn');
            button.disabled = false;
            button.textContent = 'Verify';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Initialize app
const app = new TelegramNotifierApp();