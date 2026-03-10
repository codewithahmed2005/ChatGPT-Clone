const API_URL = 'https://chatgpt-clone-backend-mhgw.onrender.com/api/chat';
let messages = [];
let isLoading = false;
let currentChatId = Date.now();
let chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
let isTemporaryChat = false;
let searchMode = false;
let customInstructions = localStorage.getItem('customInstructions') || '';
let chatToRename = null;

// ==========================================
// VOICE INPUT VARIABLES
// ==========================================
let recognition = null;
let isRecording = false;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('messageInput');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }
    
    // Initialize voice input on load
    initVoiceInput();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K to focus input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('messageInput').focus();
        }
        
        // Escape to cancel edit
        if (e.key === 'Escape') {
            const editContainer = document.querySelector('.edit-container');
            if (editContainer) {
                editContainer.querySelector('.edit-cancel').click();
            }
        }
        
        // Ctrl/Cmd + Shift + O for new chat
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            startNewChat();
        }
        
        // Ctrl/Cmd + F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
    });
    
    // Check for saved temp mode
    const savedTempMode = localStorage.getItem('tempChatMode');
    if (savedTempMode === 'true') {
        isTemporaryChat = true;
        const btn = document.getElementById('tempChatBtn');
        const indicator = document.getElementById('tempChatIndicator');
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '🔒 Private';
        }
        if (indicator) {
            indicator.style.display = 'block';
        }
    }
    
    checkBackendHealth();
    renderChatHistory();
});

// ==========================================
// VOICE INPUT FUNCTIONS
// ==========================================
function initVoiceInput() {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.log('Voice input not supported in this browser');
        return false;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = function() {
        isRecording = true;
        updateVoiceButtonState();
        console.log('Voice recording started');
    };
    
    recognition.onresult = function(event) {
        const transcript = Array.from(event.results)
            .map(result => result[0])
            .map(result => result.transcript)
            .join('');
        
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = transcript;
            // Auto-resize
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        }
        
        // If final result, stop recording
        if (event.results[0].isFinal) {
            stopVoiceInput();
        }
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        stopVoiceInput();
        
        if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please allow microphone access in your browser settings.');
        } else if (event.error === 'no-speech') {
            alert('No speech detected. Please try again.');
        } else if (event.error === 'network') {
            alert('Network error. Please check your connection.');
        }
    };
    
    recognition.onend = function() {
        stopVoiceInput();
    };
    
    return true;
}

function toggleVoiceInput() {
    if (!recognition) {
        const initialized = initVoiceInput();
        if (!initialized) {
            alert('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
            return;
        }
    }
    
    if (isRecording) {
        stopVoiceInput();
    } else {
        startVoiceInput();
    }
}

function startVoiceInput() {
    if (!recognition) return;
    
    try {
        recognition.start();
    } catch (e) {
        console.error('Error starting recognition:', e);
        // If already started, stop and restart
        recognition.stop();
        setTimeout(() => {
            try {
                recognition.start();
            } catch (err) {
                console.error('Failed to restart recognition:', err);
            }
        }, 100);
    }
}

function stopVoiceInput() {
    isRecording = false;
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.log('Recognition already stopped');
        }
    }
    updateVoiceButtonState();
}

function updateVoiceButtonState() {
    const btn = document.getElementById('voiceBtn');
    if (!btn) return;
    
    if (isRecording) {
        btn.classList.add('recording');
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
        `;
        btn.title = 'Stop recording';
    } else {
        btn.classList.remove('recording');
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
        `;
        btn.title = 'Voice input';
    }
}

// ==========================================
// MESSAGE SENDING
// ==========================================
function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const content = input.value.trim();
    
    if (!content || isLoading) return;
    
    addMessage('user', content);
    messages.push({ role: 'user', content: content });
    
    input.value = '';
    input.style.height = 'auto';
    
    isLoading = true;
    sendBtn.disabled = true;
    
    const messageId = 'msg-' + Date.now();
    addStreamingMessage(messageId);
    
    try {
        const response = await fetch(API_URL + '/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMessage = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.content) {
                            fullMessage += data.content;
                            updateStreamingMessage(messageId, fullMessage);
                        }
                        if (data.error) throw new Error(data.error);
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }
        }
        
        messages.push({ role: 'assistant', content: fullMessage });
        saveChat();
        showSaveIndicator();
        
    } catch (error) {
        console.error('Stream error:', error);
        updateStreamingMessage(messageId, 'Error: ' + error.message, true);
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        finalizeStreamingMessage(messageId);
    }
}

// ==========================================
// MESSAGE RENDERING
// ==========================================
function addMessage(role, content, isError = false) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatarText = role === 'user' ? 'U' : 'AI';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let renderedContent;
    
    if (role === 'assistant') {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function(code, lang) {
                    if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (e) {
                            return code;
                        }
                    }
                    return code;
                },
                langPrefix: 'hljs language-',
                breaks: true,
                gfm: true
            });
            renderedContent = marked.parse(content);
        } else {
            renderedContent = escapeHtml(content).replace(/\n/g, '<br>');
        }
    } else {
        renderedContent = escapeHtml(content).replace(/\n/g, '<br>');
    }
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="avatar-icon">${avatarText}</div>
            <div class="message-text ${isError ? 'error' : ''}">
                ${renderedContent}
                <div class="message-time">${timestamp}</div>
            </div>
        </div>
    `;
    
    container.appendChild(messageDiv);
    scrollToBottom();
    
    if (role === 'assistant' && typeof hljs !== 'undefined') {
        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    if (role === 'assistant') {
        addCodeCopyButtons(messageDiv);
    }
    
    addMessageActions(messageDiv);
}

function addStreamingMessage(id) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.id = id;
    messageDiv.className = 'message assistant streaming';
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="avatar-icon">AI</div>
            <div class="message-text">
                <div class="streaming-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(messageDiv);
    scrollToBottom();
}

function updateStreamingMessage(id, content, isError = false) {
    const messageDiv = document.getElementById(id);
    if (!messageDiv) return;
    
    const textDiv = messageDiv.querySelector('.message-text');
    if (!textDiv) return;
    
    if (typeof marked !== 'undefined') {
        textDiv.innerHTML = marked.parse(content) + '<span class="streaming-cursor">▊</span>';
    } else {
        textDiv.innerHTML = escapeHtml(content) + '<span class="streaming-cursor">▊</span>';
    }
    
    if (isError) textDiv.classList.add('error');
    
    if (typeof hljs !== 'undefined') {
        textDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    scrollToBottom();
}

function finalizeStreamingMessage(id, error = null) {
    const messageDiv = document.getElementById(id);
    if (!messageDiv) return;
    
    const cursor = messageDiv.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();
    
    messageDiv.classList.remove('streaming');
    
    if (error) {
        const textDiv = messageDiv.querySelector('.message-text');
        textDiv.innerHTML = `
            <div class="error-message">
                <p>⚠️ ${escapeHtml(error)}</p>
                <button class="retry-btn" onclick="retryMessage('${id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    Retry
                </button>
            </div>
        `;
    } else {
        addCodeCopyButtons(messageDiv);
        addMessageActions(messageDiv);
    }
}

// ==========================================
// MESSAGE ACTIONS (Copy, Edit, Regenerate, Branch)
// ==========================================
function addMessageActions(messageDiv) {
    const content = messageDiv.querySelector('.message-content');
    if (!content) return;
    
    const existingActions = content.querySelector('.message-actions');
    if (existingActions) existingActions.remove();
    
    const isUser = messageDiv.classList.contains('user');
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    let buttonsHTML = `
        <button class="action-btn copy-btn" title="Copy message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        </button>
    `;
    
    if (isUser) {
        buttonsHTML += `
            <button class="action-btn edit-btn" title="Edit message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="action-btn branch-btn" title="Branch from here">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="6" y1="3" x2="6" y2="15"></line>
                    <circle cx="18" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
            </button>
        `;
    } else {
        buttonsHTML += `
            <button class="action-btn regenerate-btn" title="Regenerate response">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
            </button>
        `;
    }
    
    actionsDiv.innerHTML = buttonsHTML;
    
    const copyBtn = actionsDiv.querySelector('.copy-btn');
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyMessage(messageDiv);
    });
    
    if (isUser) {
        const editBtn = actionsDiv.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editMessage(messageDiv);
        });
        
        const branchBtn = actionsDiv.querySelector('.branch-btn');
        branchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            branchChat(messageDiv);
        });
    } else {
        const regenerateBtn = actionsDiv.querySelector('.regenerate-btn');
        regenerateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            regenerateMessage(messageDiv);
        });
    }
    
    content.appendChild(actionsDiv);
}

function copyMessage(messageDiv) {
    const textDiv = messageDiv.querySelector('.message-text');
    if (!textDiv) return;
    
    navigator.clipboard.writeText(textDiv.innerText).then(() => {
        const btn = messageDiv.querySelector('.copy-btn');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<span style="color: var(--accent); font-size: 10px;">✓</span>';
            setTimeout(() => btn.innerHTML = original, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy text');
    });
}

function editMessage(messageDiv) {
    const textDiv = messageDiv.querySelector('.message-text');
    const originalContent = textDiv.innerText;
    
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-container';
    editContainer.innerHTML = `
        <textarea class="edit-textarea">${originalContent}</textarea>
        <div class="edit-actions">
            <button class="edit-save">Save & Submit</button>
            <button class="edit-cancel">Cancel</button>
        </div>
    `;
    
    textDiv.innerHTML = '';
    textDiv.appendChild(editContainer);
    
    const textarea = editContainer.querySelector('.edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    editContainer.querySelector('.edit-cancel').addEventListener('click', () => {
        textDiv.innerHTML = escapeHtml(originalContent).replace(/\n/g, '<br>');
        addMessageActions(messageDiv);
    });
    
    editContainer.querySelector('.edit-save').addEventListener('click', async () => {
        const newContent = textarea.value.trim();
        
        if (!newContent || newContent === originalContent) {
            textDiv.innerHTML = escapeHtml(originalContent).replace(/\n/g, '<br>');
            addMessageActions(messageDiv);
            return;
        }
        
        const allUserMessages = Array.from(document.querySelectorAll('.message.user'));
        const userIndex = allUserMessages.indexOf(messageDiv);
        
        let userCount = 0;
        let arrayIndex = -1;
        
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'user') {
                if (userCount === userIndex) {
                    arrayIndex = i;
                    break;
                }
                userCount++;
            }
        }
        
        if (arrayIndex === -1) {
            console.error('Message not found in array');
            return;
        }
        
        messages[arrayIndex].content = newContent;
        messages = messages.slice(0, arrayIndex + 1);
        
        const allMessages = document.querySelectorAll('.message');
        let foundTarget = false;
        
        allMessages.forEach(msg => {
            if (foundTarget) {
                msg.remove();
            }
            if (msg === messageDiv) {
                foundTarget = true;
            }
        });
        
        textDiv.innerHTML = escapeHtml(newContent).replace(/\n/g, '<br>');
        addMessageActions(messageDiv);
        
        await sendEditedMessage();
    });
}

async function sendEditedMessage() {
    const sendBtn = document.getElementById('sendBtn');
    const messageId = 'msg-' + Date.now();
    
    isLoading = true;
    sendBtn.disabled = true;
    
    addStreamingMessage(messageId);
    
    try {
        const response = await fetch(API_URL + '/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMessage = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.content) {
                            fullMessage += data.content;
                            updateStreamingMessage(messageId, fullMessage);
                        }
                        if (data.error) throw new Error(data.error);
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }
        }
        
        messages.push({ role: 'assistant', content: fullMessage });
        saveChat();
        showSaveIndicator();
        
    } catch (error) {
        console.error('Stream error:', error);
        updateStreamingMessage(messageId, 'Error: ' + error.message, true);
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        finalizeStreamingMessage(messageId);
    }
}

function branchChat(fromMessageDiv) {
    const currentMessages = [...messages];
    
    const allMessages = document.querySelectorAll('.message');
    let branchIndex = -1;
    
    allMessages.forEach((msg, idx) => {
        if (msg === fromMessageDiv) branchIndex = idx;
    });
    
    startNewChat();
    
    messages = currentMessages.slice(0, branchIndex + 1);
    
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    messages.forEach(msg => addMessage(msg.role, msg.content));
    
    const branchNotice = document.createElement('div');
    branchNotice.className = 'branch-notice';
    branchNotice.innerHTML = '🌿 Branched from previous conversation';
    container.appendChild(branchNotice);
}

function regenerateMessage(messageDiv) {
    const allAssistantMessages = Array.from(document.querySelectorAll('.message.assistant'));
    const messageIndex = allAssistantMessages.indexOf(messageDiv);
    
    if (messageIndex === -1) {
        console.error('Message not found in DOM');
        return;
    }
    
    for (let i = messageIndex; i < allAssistantMessages.length; i++) {
        allAssistantMessages[i].remove();
    }
    
    let assistantCount = 0;
    let cutIndex = -1;
    
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'assistant') {
            if (assistantCount === messageIndex) {
                cutIndex = i;
                break;
            }
            assistantCount++;
        }
    }
    
    if (cutIndex !== -1) {
        messages = messages.slice(0, cutIndex);
    }
    
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        console.error('No user message to regenerate from');
        return;
    }
    
    const messageId = 'msg-' + Date.now();
    addStreamingMessage(messageId);
    
    isLoading = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    
    fetch(API_URL + '/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMessage = '';
        
        function read() {
            return reader.read().then(({ done, value }) => {
                if (done) {
                    messages.push({ role: 'assistant', content: fullMessage });
                    saveChat();
                    showSaveIndicator();
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    finalizeStreamingMessage(messageId);
                    return;
                }
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.content) {
                                fullMessage += data.content;
                                updateStreamingMessage(messageId, fullMessage);
                            }
                            if (data.error) throw new Error(data.error);
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') {
                                console.error('Parse error:', e);
                            }
                        }
                    }
                }
                
                return read();
            });
        }
        
        return read();
    })
    .catch(error => {
        console.error('Regenerate error:', error);
        updateStreamingMessage(messageId, 'Error: ' + error.message, true);
        isLoading = false;
        if (sendBtn) sendBtn.disabled = false;
        finalizeStreamingMessage(messageId);
    });
}

function retryMessage(messageId) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;
    
    messageDiv.remove();
    
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        messages.pop();
    }
    
    sendMessage();
}

// ==========================================
// CODE COPY BUTTONS
// ==========================================
function addCodeCopyButtons(messageDiv) {
    const preBlocks = messageDiv.querySelectorAll('pre');
    
    preBlocks.forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return;
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
        `;
        
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = pre.querySelector('code');
            const text = code ? code.innerText : pre.innerText;
            
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.innerHTML = `<span style="color: var(--accent);">✓ Copied!</span>`;
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy</span>
                    `;
                }, 2000);
            });
        });
        
        pre.appendChild(copyBtn);
    });
}

// ==========================================
// SEARCH FUNCTIONALITY
// ==========================================
function toggleSearch() {
    searchMode = !searchMode;
    
    if (searchMode) {
        const searchBar = document.createElement('div');
        searchBar.className = 'search-bar';
        searchBar.id = 'searchBar';
        searchBar.innerHTML = `
            <input type="text" id="searchInput" placeholder="Search in conversation..." />
            <span class="search-count" id="searchCount">0/0</span>
            <button onclick="toggleSearch()">✕</button>
        `;
        document.querySelector('.chat-header').appendChild(searchBar);
        
        document.getElementById('searchInput').addEventListener('input', (e) => {
            searchInConversation(e.target.value);
        });
        
        document.getElementById('searchInput').focus();
    } else {
        document.getElementById('searchBar')?.remove();
        clearSearchHighlights();
    }
}

function searchInConversation(query) {
    if (!query) {
        clearSearchHighlights();
        document.getElementById('searchCount').textContent = '0/0';
        return;
    }
    
    clearSearchHighlights();
    
    const messageTexts = document.querySelectorAll('.message-text');
    let matches = 0;
    
    messageTexts.forEach(textDiv => {
        const text = textDiv.innerText;
        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        
        if (regex.test(text)) {
            matches++;
            const originalHTML = textDiv.innerHTML;
            const newHTML = originalHTML.replace(regex, '<mark>$1</mark>');
            if (originalHTML !== newHTML) {
                textDiv.innerHTML = newHTML;
                textDiv.classList.add('search-match');
            }
        }
    });
    
    document.getElementById('searchCount').textContent = `${matches} matches`;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearSearchHighlights() {
    document.querySelectorAll('mark').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
    document.querySelectorAll('.search-match').forEach(el => el.classList.remove('search-match'));
}

// ==========================================
// CUSTOM INSTRUCTIONS
// ==========================================
function setCustomInstructions() {
    const instructions = prompt('Enter custom instructions for the AI:', customInstructions);
    if (instructions !== null) {
        customInstructions = instructions;
        localStorage.setItem('customInstructions', instructions);
        updateSystemMessage();
        alert('Custom instructions saved! They will apply to new chats.');
    }
}

function updateSystemMessage() {
    messages = messages.filter(m => m.role !== 'system');
    
    if (customInstructions) {
        messages.unshift({
            role: 'system',
            content: customInstructions
        });
    }
}

// ==========================================
// TEMPORARY CHAT
// ==========================================
function toggleTemporaryChat() {
    isTemporaryChat = !isTemporaryChat;
    const btn = document.getElementById('tempChatBtn');
    const indicator = document.getElementById('tempChatIndicator');
    
    if (isTemporaryChat) {
        btn.classList.add('active');
        btn.innerHTML = '🔒 Private';
        localStorage.setItem('tempChatMode', 'true');
        if (indicator) indicator.style.display = 'block';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '🌐 Normal';
        localStorage.removeItem('tempChatMode');
        if (indicator) indicator.style.display = 'none';
    }
    
    startNewChat();
}

// ==========================================
// SAVE INDICATOR
// ==========================================
function showSaveIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'save-indicator';
    indicator.textContent = '💾 Saved';
    document.body.appendChild(indicator);
    
    setTimeout(() => indicator.remove(), 2000);
}

// ==========================================
// CHAT HISTORY
// ==========================================
function saveChat() {
    if (isTemporaryChat || messages.length === 0) return;
    
    const chatTitle = messages[0].content.substring(0, 30) + (messages[0].content.length > 30 ? '...' : '');
    const existingIndex = chatHistory.findIndex(c => c.id === currentChatId);
    
    const chatData = {
        id: currentChatId,
        title: chatTitle,
        messages: [...messages],
        timestamp: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        chatHistory[existingIndex] = chatData;
    } else {
        chatHistory.unshift(chatData);
    }
    
    chatHistory = chatHistory.slice(0, 20);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    renderChatHistory();
}

function renderChatHistory() {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    
    container.innerHTML = '';
    
    chatHistory.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        item.dataset.chatId = chat.id;
        item.innerHTML = `
            <div class="chat-title">${escapeHtml(chat.title)}</div>
            <div class="chat-date">${new Date(chat.timestamp).toLocaleDateString()}</div>
            <button class="chat-menu-btn" title="More options" onclick="event.stopPropagation(); toggleChatMenu(${chat.id}, this)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                </svg>
            </button>
            <div class="chat-dropdown" id="dropdown-${chat.id}">
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); startRenameChat(${chat.id}); hideChatMenu(${chat.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Rename
                </button>
                <button class="chat-dropdown-item delete" onclick="event.stopPropagation(); deleteChat(${chat.id}); hideChatMenu(${chat.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            </div>
        `;
        item.onclick = (e) => {
            if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-dropdown')) {
                // Close any open dropdowns
                document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
                loadChat(chat.id);
            }
        };
        container.appendChild(item);
    });
}

// ==========================================
// CHAT MENU DROPDOWN
// ==========================================

function toggleChatMenu(chatId, btn) {
    const dropdown = document.getElementById(`dropdown-${chatId}`);
    const isOpen = dropdown.classList.contains('show');
    
    // Close all other dropdowns
    document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
    
    if (!isOpen) {
        dropdown.classList.add('show');
        
        // Adjust position if dropdown goes off screen
        const rect = dropdown.getBoundingClientRect();
        const containerRect = document.getElementById('chatHistory').getBoundingClientRect();
        
        if (rect.bottom > containerRect.bottom) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = '100%';
        } else {
            dropdown.style.top = '100%';
            dropdown.style.bottom = 'auto';
        }
    }
}

function hideChatMenu(chatId) {
    const dropdown = document.getElementById(`dropdown-${chatId}`);
    if (dropdown) dropdown.classList.remove('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-item')) {
        document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
    }
});

// ==========================================
// DELETE & RENAME CHAT
// ==========================================

function deleteChat(chatId) {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    
    chatHistory = chatHistory.filter(c => c.id !== chatId);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    
    if (currentChatId === chatId) {
        startNewChat();
    } else {
        renderChatHistory();
    }
}

function startRenameChat(chatId) {
    chatToRename = chatId;
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    
    const input = document.getElementById('renameInput');
    input.value = chat.title;
    document.getElementById('renameModal').style.display = 'flex';
    input.focus();
    input.select();
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
    chatToRename = null;
}

function confirmRename() {
    if (!chatToRename) return;
    
    const newTitle = document.getElementById('renameInput').value.trim();
    if (!newTitle) {
        closeRenameModal();
        return;
    }
    
    const chatIndex = chatHistory.findIndex(c => c.id === chatToRename);
    if (chatIndex !== -1) {
        chatHistory[chatIndex].title = newTitle;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        renderChatHistory();
    }
    
    closeRenameModal();
}

// ==========================================
// SIDEBAR TOGGLE
// ==========================================


// Update toggleSidebar to handle both desktop and mobile
function toggleSidebar() {
    // Check if mobile view
    if (window.innerWidth <= 767) {
        toggleMobileSidebar();
        return;
    }
    
    // Desktop behavior
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('sidebarOpenBtn');
    
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        openBtn.classList.add('show');
        localStorage.setItem('sidebarCollapsed', 'true');
    } else {
        openBtn.classList.remove('show');
        localStorage.setItem('sidebarCollapsed', 'false');
    }
}

// Close mobile sidebar when resizing to desktop
window.addEventListener('resize', () => {
    if (window.innerWidth > 767) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    }
});


// Update DOMContentLoaded to handle mobile
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('messageInput');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        
        // Handle mobile keyboard
        textarea.addEventListener('focus', () => {
            setTimeout(() => {
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
    }
    
    // Initialize voice input on load
    initVoiceInput();
    
    // Check saved sidebar state (desktop only)
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true' && window.innerWidth > 767) {
        const sidebar = document.getElementById('sidebar');
        const openBtn = document.getElementById('sidebarOpenBtn');
        if (sidebar) sidebar.classList.add('collapsed');
        if (openBtn) openBtn.classList.add('show');
    }
    
    // Check for saved temp mode
    const savedTempMode = localStorage.getItem('tempChatMode');
    if (savedTempMode === 'true') {
        isTemporaryChat = true;
        const btn = document.getElementById('tempChatBtn');
        const indicator = document.getElementById('tempChatIndicator');
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '🔒 Private';
        }
        if (indicator) {
            indicator.style.display = 'block';
        }
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in input
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            // Allow Escape even in input
            if (e.key !== 'Escape') return;
        }
        
        // Ctrl/Cmd + K to focus input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('messageInput').focus();
        }
        
        // Escape to cancel edit or close sidebar/modal
        if (e.key === 'Escape') {
            const editContainer = document.querySelector('.edit-container');
            const modal = document.getElementById('renameModal');
            const sidebar = document.getElementById('sidebar');
            
            if (editContainer) {
                editContainer.querySelector('.edit-cancel').click();
            } else if (modal && modal.style.display === 'flex') {
                closeRenameModal();
            } else if (sidebar.classList.contains('show') && window.innerWidth <= 767) {
                toggleMobileSidebar();
            }
        }
        
        // Ctrl/Cmd + Shift + O for new chat
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            startNewChat();
        }
        
        // Ctrl/Cmd + F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
        
        // Ctrl/Cmd + B to toggle sidebar
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
    
    // Touch gesture for mobile sidebar (swipe from left edge)
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
        const sidebar = document.getElementById('sidebar');
        const swipeThreshold = 50;
        const startZone = 30; // Left edge zone
        
        // Open sidebar: swipe right from left edge
        if (touchEndX > touchStartX + swipeThreshold && 
            touchStartX < startZone && 
            window.innerWidth <= 767 &&
            !sidebar.classList.contains('show')) {
            toggleMobileSidebar();
        }
        
        // Close sidebar: swipe left
        if (touchStartX > touchEndX + swipeThreshold && 
            sidebar.classList.contains('show') &&
            window.innerWidth <= 767) {
            toggleMobileSidebar();
        }
    }
    
    checkBackendHealth();
    renderChatHistory();
    
    // Close modal on outside click
    const modal = document.getElementById('renameModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRenameModal();
            }
        });
    }
});

// Close modal on Escape key
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ... existing shortcuts ...
        
        // Ctrl/Cmd + B to toggle sidebar
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
// Close modal on outside click
document.getElementById('renameModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('renameModal')) {
        closeRenameModal();
    }
});

// ==========================================
// MOBILE SIDEBAR TOGGLE
// ==========================================

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
    
    // Prevent body scroll when sidebar is open
    if (sidebar.classList.contains('show')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

function loadChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    
    currentChatId = chatId;
    messages = JSON.parse(JSON.stringify(chat.messages));
    
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    messages.forEach(msg => addMessage(msg.role, msg.content));
    renderChatHistory();
}

function startNewChat() {
    if (messages.length > 0 && !isTemporaryChat) {
        saveChat();
    }
    
    currentChatId = Date.now();
    messages = [];
    
    if (customInstructions) {
        messages.unshift({
            role: 'system',
            content: customInstructions
        });
    }
    
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = `
            <div class="welcome-message">
                <h1>How can I help you today?</h1>
                <p>Ask me anything - I'm powered by Llama 3 8B via OpenRouter</p>
            </div>
        `;
    }
    
    const indicator = document.getElementById('tempChatIndicator');
    if (indicator) {
        indicator.style.display = isTemporaryChat ? 'block' : 'none';
    }
    
    renderChatHistory();
    
    const input = document.getElementById('messageInput');
    if (input) input.focus();
}

// ==========================================
// EXPORT
// ==========================================
function exportChat(format = 'markdown') {
    if (messages.length === 0) {
        alert('No messages to export');
        return;
    }
    
    let content = '';
    const timestamp = new Date().toLocaleString();
    
    switch(format) {
        case 'markdown':
            content = `# Chat Export - ${timestamp}\n\n`;
            messages.forEach(msg => {
                const role = msg.role === 'user' ? 'You' : 'Assistant';
                content += `## ${role}\n\n${msg.content}\n\n---\n\n`;
            });
            break;
            
        case 'txt':
            content = `Chat Export - ${timestamp}\n${'='.repeat(50)}\n\n`;
            messages.forEach(msg => {
                const role = msg.role === 'user' ? 'You' : 'Assistant';
                content += `${role}:\n${msg.content}\n\n`;
            });
            break;
            
        case 'json':
            content = JSON.stringify({
                exportDate: timestamp,
                model: 'Llama 3 8B',
                messages: messages
            }, null, 2);
            break;
    }
    
    const blob = new Blob([content], { 
        type: format === 'json' ? 'application/json' : 'text/plain' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${currentChatId}.${format === 'markdown' ? 'md' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function checkBackendHealth() {
    try {
        const response = await fetch('https://chatgpt-clone-backend-mhgw.onrender.com/api/health');
        console.log(response.ok ? 'Backend connected' : 'Backend health check failed');
    } catch (e) {
        console.warn('Backend not reachable:', e.message);
    }
}

// Auto-save every 30 seconds
setInterval(saveChat, 30000);

// Save before page unload

window.addEventListener('beforeunload', saveChat);
