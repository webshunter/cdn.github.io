// ChatBot class definition
class ChatBot {
    constructor() {
        // Get existing session ID or create new one
        try {
            this.currentSessionId = localStorage.getItem('chatbot_session_id');
            if (!this.currentSessionId) {
                this.currentSessionId = this.generateSessionId();
                localStorage.setItem('chatbot_session_id', this.currentSessionId);
            }
        } catch (error) {
            console.error('Error accessing localStorage:', error);
            this.currentSessionId = this.generateSessionId();
        }
        
        this.lastActivityTime = Date.now();
        this.chatHistory = [];
        this.dbName = 'ChatBotDB';
        this.storeName = 'chatHistory';
        this.dbVersion = 1;
        this.isInitialized = false;
        this.messages = null; // Will store messages container reference
        this.isListening = false; // For speech recognition state
        this.synth = window.speechSynthesis; // For text-to-speech
        this.isSpeaking = false; // For TTS state
        
        this.initDB().then(() => {
            this.isInitialized = true;
            console.log('DB initialized, loading initial history...');
            this.loadChatHistory();
            this.startInactivityCheck();
        });
    }

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${randomStr}`;
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('Error opening IndexedDB:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('IndexedDB opened successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
                }
            };
        });
    }

    async loadChatHistory() {
        if (!this.isInitialized) {
            console.log('Waiting for DB initialization...');
            return;
        }

        try {
            console.log('Loading chat history for session:', this.currentSessionId);
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(this.currentSessionId);

            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const data = event.target.result;
                    console.log('Retrieved data from IndexedDB:', data);
                    
                    if (data && data.history && data.history.length > 0) {
                        console.log('Found existing chat history');
                        this.chatHistory = data.history;
                    } else {
                        console.log('No existing history, creating new with welcome message');
                        this.chatHistory = [{
                            role: 'bot',
                            content: 'Selamat datang! Saya INA, asisten virtual dari Hubunk. Saya siap membantu Anda dengan informasi seputar layanan kami. Ada yang bisa saya bantu?'
                        }];
                        this.saveChatHistory();
                    }
                    
                    if (this.messages) {
                        this.renderChatHistory();
                    }
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error loading chat history:', event.target.error);
                    this.chatHistory = [{
                        role: 'bot',
                        content: 'Selamat datang! Saya INA, asisten virtual dari Hubunk. Saya siap membantu Anda dengan informasi seputar layanan kami. Ada yang bisa saya bantu?'
                    }];
                    if (this.messages) {
                        this.renderChatHistory();
                    }
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Error in loadChatHistory:', error);
            this.chatHistory = [{
                role: 'bot',
                content: 'Selamat datang! Saya INA, asisten virtual dari Hubunk. Saya siap membantu Anda dengan informasi seputar layanan kami. Ada yang bisa saya bantu?'
            }];
            if (this.messages) {
                this.renderChatHistory();
            }
        }
    }

    async saveChatHistory() {
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const data = {
                sessionId: this.currentSessionId,
                history: this.chatHistory,
                lastUpdated: Date.now()
            };
            await store.put(data);
            console.log('Saved chat history to IndexedDB:', this.chatHistory);
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    async clearChatHistory() {
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await store.delete(this.currentSessionId);
            
            // Reset to welcome message
            this.chatHistory = [{
                role: 'bot',
                content: 'Selamat datang! Saya INA, asisten virtual dari Hubunk. Saya siap membantu Anda dengan informasi seputar layanan kami. Ada yang bisa saya bantu?'
            }];
            await this.saveChatHistory();
            this.renderChatHistory();
        } catch (error) {
            console.error('Error clearing chat history:', error);
        }
    }

    startInactivityCheck() {
        setInterval(() => {
            const currentTime = Date.now();
            const inactiveTime = currentTime - this.lastActivityTime;
            if (inactiveTime > 30 * 60 * 1000) { // 30 minutes in milliseconds
                this.clearChatHistory();
            }
        }, 60000); // Check every minute
    }

    updateLastActivity() {
        this.lastActivityTime = Date.now();
    }

    renderChatHistory() {
        if (!this.messages) {
            console.log('Messages container not found');
            return;
        }

        console.log('Rendering chat history:', this.chatHistory);
        this.messages.innerHTML = '';
        this.chatHistory.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role}`;
            messageDiv.textContent = msg.content;
            this.messages.appendChild(messageDiv);
        });
        // Scroll to bottom after rendering
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    speakText(text) {
        if (this.synth) {
            // Cancel any ongoing speech
            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID'; // Set to Indonesian
            utterance.rate = 1.0; // Normal speed
            utterance.pitch = 1.0; // Normal pitch
            utterance.volume = 1.0; // Full volume

            // Get available voices
            const voices = this.synth.getVoices();
            // Try to find Indonesian voice
            const indonesianVoice = voices.find(voice => voice.lang.includes('id-ID'));
            if (indonesianVoice) {
                utterance.voice = indonesianVoice;
            }

            utterance.onstart = () => {
                this.isSpeaking = true;
            };

            utterance.onend = () => {
                this.isSpeaking = false;
            };

            this.synth.speak(utterance);
        }
    }

    init() {
        // Create and inject styles
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');
            @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css');

            .chatbot-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                font-family: 'Lato', Arial, sans-serif;
            }

            .chatbot-icon {
                width: 60px;
                height: 60px;
                background-color: #f05730;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 2px 12px rgba(240, 87, 48, 0.2);
                transition: transform 0.2s;
            }

            .chatbot-icon:hover {
                transform: scale(1.1);
            }

            .chatbot-icon svg {
                width: 30px;
                height: 30px;
                fill: white;
            }

            .chatbot-window {
                position: fixed;
                bottom: 90px;
                right: 20px;
                width: 350px;
                height: 500px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 5px 40px rgba(240, 87, 48, 0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
            }

            .chatbot-header {
                background: #f05730;
                color: white;
                padding: 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .chatbot-header .header-content {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .chatbot-header .avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background-color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #f05730;
                overflow: hidden;
                position: relative;
            }

            .chatbot-header .avatar img {
                width: 160%;
                height: 160%;
                object-fit: cover;
                object-position: center top;
                transform-origin: top center;
                position: absolute;
                top: 0;
            }

            .chatbot-header .title {
                font-size: 16px;
            }

            .chatbot-close {
                cursor: pointer;
                font-size: 20px;
            }

            .chatbot-messages {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                background: linear-gradient(to bottom, #ffffff, #f8fafc);
            }

            .chatbot-input {
                padding: 15px;
                border-top: 1px solid #90bada;
                display: flex;
                gap: 10px;
                background: white;
            }

            .chatbot-input input {
                flex: 1;
                padding: 10px;
                border: 1px solid #90bada;
                border-radius: 20px;
                outline: none;
                transition: border-color 0.2s;
            }

            .chatbot-input input:focus {
                border-color: #f05730;
            }

            .chatbot-input button {
                background: #f05730;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 20px;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .chatbot-input button:hover {
                background: #d16218;
            }

            .mic-button {
                background: #f05730;
                color: white;
                border: none;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .mic-button:hover {
                background: #d16218;
            }

            .mic-button.listening {
                background: #d16218;
                animation: pulse 1.5s infinite;
            }

            @keyframes pulse {
                0% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                }
            }

            .mic-button i {
                font-size: 18px;
            }

            .message {
                margin-bottom: 10px;
                max-width: 80%;
            }

            .message.user {
                margin-left: auto;
                background: #f05730;
                color: white;
                padding: 10px 15px;
                border-radius: 15px 15px 0 15px;
            }

            .message.bot {
                background: #f8fafc;
                color: #103b19;
                padding: 10px 15px;
                border-radius: 15px 15px 15px 0;
                border: 1px solid #90bada;
            }

            .message.bot ul {
                list-style: none;
                padding-left: 0;
                margin: 5px 0;
            }

            .message.bot li {
                position: relative;
                padding-left: 20px;
                margin: 5px 0;
            }

            .message.bot li:before {
                content: "•";
                position: absolute;
                left: 0;
                color: #f05730;
                font-weight: bold;
            }

            .message.bot strong {
                color: #f05730;
                font-weight: 600;
            }

            .message.loading {
                background: #f8fafc;
                padding: 10px 15px;
                border-radius: 15px 15px 15px 0;
                opacity: 0.7;
                border: 1px solid #90bada;
            }

            .message.bot .speak-button {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: #f05730;
                cursor: pointer;
                padding: 5px;
                opacity: 0.6;
                transition: opacity 0.2s;
            }

            .message.bot .speak-button:hover {
                opacity: 1;
            }

            .message.bot .speak-button.speaking {
                color: #d16218;
                animation: pulse 1.5s infinite;
            }
        `;
        document.head.appendChild(style);

        // Create widget container
        const widget = document.createElement('div');
        widget.className = 'chatbot-widget';
        widget.innerHTML = `
            <div class="chatbot-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                </svg>
            </div>
            <div class="chatbot-window">
                <div class="chatbot-header">
                    <div class="header-content">
                        <div class="avatar">
                            <img src="https://webshunter.github.io/cdn.github.io/ina.png?v=image-${Date.now()}" alt="INA Hubunk">
                        </div>
                        <span class="title">INA Hubunk</span>
                    </div>
                    <span class="chatbot-close">&times;</span>
                </div>
                <div class="chatbot-messages"></div>
                <div class="chatbot-input">
                    <input type="text" placeholder="Type your message...">
                    <button class="mic-button" title="Speak your message">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button>Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // Get elements
        const icon = widget.querySelector('.chatbot-icon');
        const window = widget.querySelector('.chatbot-window');
        const close = widget.querySelector('.chatbot-close');
        const input = widget.querySelector('input');
        const send = widget.querySelector('button:not(.mic-button)');
        const micButton = widget.querySelector('.mic-button');
        this.messages = widget.querySelector('.chatbot-messages');

        // Initialize speech recognition
        let recognition = null;
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'id-ID'; // Set to Indonesian language

                recognition.onstart = () => {
                    this.isListening = true;
                    micButton.classList.add('listening');
                };

                recognition.onend = () => {
                    this.isListening = false;
                    micButton.classList.remove('listening');
                };

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    input.value = transcript;
                    sendMessage();
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    this.isListening = false;
                    micButton.classList.remove('listening');
                    
                    // Show error message to user
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'message bot';
                    errorMessage.textContent = "Maaf, terjadi kesalahan saat mengenali suara. Silakan coba lagi atau ketik pesan Anda.";
                    this.messages.appendChild(errorMessage);
                };
            } else {
                micButton.style.display = 'none'; // Hide mic button if not supported
            }
        } catch (error) {
            console.error('Speech recognition initialization error:', error);
            micButton.style.display = 'none'; // Hide mic button if initialization fails
        }

        // Toggle chat window
        icon.addEventListener('click', async () => {
            const isOpening = window.style.display !== 'flex';
            window.style.display = isOpening ? 'flex' : 'none';
            
            if (isOpening) {
                this.updateLastActivity();
                console.log('Chat window opened, loading history...');
                await this.loadChatHistory();
            }
        });

        close.addEventListener('click', () => {
            window.style.display = 'none';
        });

        // Send message
        const sendMessage = async () => {
            const text = input.value.trim();
            if (text) {
                this.updateLastActivity();

                // Add user message
                const userMessage = document.createElement('div');
                userMessage.className = 'message user';
                userMessage.textContent = text;
                this.messages.appendChild(userMessage);

                // Add to history
                this.chatHistory.push({ role: 'user', content: text });
                await this.saveChatHistory();

                // Add loading message
                const loadingMessage = document.createElement('div');
                loadingMessage.className = 'message bot loading';
                loadingMessage.textContent = 'Typing...';
                this.messages.appendChild(loadingMessage);

                // Clear input
                input.value = '';

                // Scroll to bottom
                this.messages.scrollTop = this.messages.scrollHeight;

                try {
                    // Send message to webhook
                    const res = await fetch("https://hook.gugusdarmayanto.my.id/webhook/0a4ca5b0-3d99-43d8-abca-ad792570f670", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify([{
                            sessionId: this.currentSessionId,
                            action: "sendMessage",
                            chatInput: text
                        }]),
                    });

                    const data = await res.json();
                    
                    // Remove loading message
                    this.messages.removeChild(loadingMessage);

                    // Add bot response
                    const botMessage = document.createElement('div');
                    botMessage.className = 'message bot';
                    botMessage.textContent = data[0]?.aiResponse || "Tidak ada balasan.";
                    this.messages.appendChild(botMessage);

                    // Add to history
                    this.chatHistory.push({ role: 'bot', content: data[0]?.aiResponse || "Tidak ada balasan." });
                    await this.saveChatHistory();

                    // Auto-speak the response
                    this.speakText(data[0]?.aiResponse || "Tidak ada balasan.");
                } catch (err) {
                    // Remove loading message
                    this.messages.removeChild(loadingMessage);

                    // Add error message
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'message bot';
                    errorMessage.textContent = "Gagal terhubung ke server.";
                    this.messages.appendChild(errorMessage);

                    // Add to history
                    this.chatHistory.push({ role: 'bot', content: "Gagal terhubung ke server." });
                    await this.saveChatHistory();
                }

                // Scroll to bottom
                this.messages.scrollTop = this.messages.scrollHeight;
            }
        };

        // Handle mic button click
        micButton.addEventListener('click', () => {
            if (!recognition) {
                alert('Speech recognition is not supported in your browser.');
                return;
            }

            if (this.isListening) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        send.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Initial render of chat history
        this.renderChatHistory();
    }
}

// Create and export the init function
const init = () => {
    const chatbot = new ChatBot();
    chatbot.init();
};

export { init }; 
