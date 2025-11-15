// script.js (FINAL - With DOM and Bug Fixes)
const AIPlayer = window.AIPlayer;

// Constants
const RELAY_SERVER_URL = 'wss://morris-relay.onrender.com';
const KEEP_ALIVE_INTERVAL = 25000; // 25 seconds
const MAX_PING_DISPLAY = 200; // milliseconds
const AI_THINKING_DELAY_MIN = 500; // milliseconds
const AI_THINKING_DELAY_MAX = 900; // milliseconds
const AI_REMOVE_DELAY = 400; // milliseconds
const INITIAL_PIECES = 9;
const MIN_PIECES_TO_FLY = 3;
const STORAGE_KEY = 'nineMensMorrisSettings';
const MAX_NAME_LENGTH = 15;
const ROOM_CODE_LENGTH = 4;
const CONFETTI_COUNT = 50;
const RECONNECT_DELAY = 3000; // milliseconds

class NineMensMorrisGame {
    constructor() {
        this.board = Array(24).fill(null);
        this.currentPlayer = 1;
        this.gameOver = false;
        this.isAIThinking = false;
        this.player1Name = "You";
        this.player2Name = "Opponent";
        this.onNameSetCallback = null;
        this.networkSocket = null;
        this.lastPingTime = null;
        this.currentPing = 0;
        this.messageQueue = [];
        this.messageIdCounter = 0;
        this.pendingMessages = new Map(); // Track messages waiting for acknowledgment
        this.receivedMessageIds = new Set(); // Track received message IDs to prevent duplicates
        this.ackTimeout = 5000; // 5 seconds timeout for acknowledgments

        this.settings = {
            difficulty: 'hard', gameType: 'ai', gameMode: 'classic',
            darkMode: true, networkRole: 'none', isMyTurn: true,
        };
        
        this.availableGameTypes = ['ai', 'human', 'network'];
        this.loadSettings();

        this.gamePhase = 'placing';
        this.piecesLeft = { 1: INITIAL_PIECES, 2: INITIAL_PIECES };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        this.winningPositions = [];
        this.availableDifficulties = ['easy', 'medium', 'hard', 'extreme'];
        this.availableGameModes = ['simple', 'classic'];
        this.ai = null;
        this.millPatterns = [[0,1,2],[2,3,4],[4,5,6],[6,7,0],[8,9,10],[10,11,12],[12,13,14],[14,15,8],[16,17,18],[18,19,20],[20,21,22],[22,23,16],[1,9,17],[3,11,19],[5,13,21],[7,15,23]];
        this.adjacencyMap = { 0:[1,7],1:[0,2,9],2:[1,3],3:[2,4,11],4:[3,5],5:[4,6,13],6:[5,7],7:[0,6,15],8:[9,15],9:[1,8,10,17],10:[9,11],11:[3,10,12,19],12:[11,13],13:[5,12,14,21],14:[13,15],15:[7,8,14,23],16:[17,23],17:[9,16,18],18:[17,19],19:[11,18,20],20:[19,21],21:[13,20,22],22:[21,23],23:[15,16,22] };

        this.dom = {
    player1: { panel: document.getElementById('player1-panel'), name: document.getElementById('player1-name'), pieces: document.getElementById('player1-pieces'), nameInput: document.getElementById('player1-name-input') },
    player2: { panel: document.getElementById('player2-panel'), name: document.getElementById('player2-name'), pieces: document.getElementById('player2-pieces') },
    resetButton: document.getElementById('reset-button'),
    settingsButton: document.getElementById('settings-button'),
    boardSVG: document.getElementById('game-board-svg'),
    allHitboxes: document.querySelectorAll('#game-board-svg .hitbox'),
    allPieces: document.querySelectorAll('#game-board-svg .piece'),
    confettiContainer: document.getElementById('confetti-container'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-button'),
    gametypeSetting: document.getElementById('gametype-setting'),
    gametypeValue: document.getElementById('gametype-value'),
    difficultySetting: document.getElementById('difficulty-setting'),
    difficultyValue: document.getElementById('difficulty-value'),
    gamemodeSetting: document.getElementById('gamemode-setting'),
    gamemodeValue: document.getElementById('gamemode-value'),
    darkmodeSetting: document.getElementById('darkmode-setting'),
    darkmodeValue: document.getElementById('darkmode-value'),
    updateNotification: document.getElementById('update-notification'),
    updateMessage: document.getElementById('update-message'),
    downloadUpdateBtn: document.getElementById('download-update-btn'),
    dismissUpdateBtn: document.getElementById('dismiss-update-btn'),
    networkSettings: document.getElementById('network-settings'),
    joinIpInput: document.getElementById('join-ip-input'),
    networkActions: document.getElementById('network-actions'),
    hostInfoPanel: document.getElementById('host-info-panel'),
    roomCodeDisplay: document.getElementById('room-code-display'),
    hostStatus: document.getElementById('host-status'),
    cancelHostBtn: document.getElementById('cancel-host-btn'),
    hostGameBtn: document.getElementById('host-game-btn'),
    joinGameBtn: document.getElementById('join-game-btn'),
    namePromptModal: document.getElementById('name-prompt-modal'),
    namePromptInput: document.getElementById('name-prompt-input'),
    namePromptConfirm: document.getElementById('name-prompt-confirm'),
    namePromptCancel: document.getElementById('name-prompt-cancel'),
    playAgainBtn: document.getElementById('play-again-button'),
    pingIndicator: document.querySelector('.ping-indicator'),
    pingValue: document.getElementById('ping-value'),
    pingFill: document.getElementById('ping-fill'),
    joiningRoomAlert: document.getElementById('joining-room-alert'),
};
    }
    
    saveSettings() {
        try {
            const settingsToSave = { 
                gameType: this.settings.gameType, 
                difficulty: this.settings.difficulty, 
                gameMode: this.settings.gameMode, 
                darkMode: this.settings.darkMode, 
                player1Name: this.player1Name 
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    loadSettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                this.settings.gameType = parsed.gameType || 'ai';
                this.settings.difficulty = parsed.difficulty || 'hard';
                this.settings.gameMode = parsed.gameMode || 'classic';
                this.settings.darkMode = parsed.darkMode !== undefined ? parsed.darkMode : true;
                this.player1Name = parsed.player1Name || 'You';
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            // Use defaults on error
        }
    }
    
    applySettings() {
        document.body.classList.toggle('light-mode', !this.settings.darkMode);
        this.updateSettingsDisplay();
    }

    initialize() {
        this.applySettings();
        this.setupDOMListeners();
        if (window.ipcRenderer) {
            window.ipcRenderer.on('update-info-available', (info) => this.showUpdateNotification(info));
        }
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            this.setupCapacitorListeners();
        }
        this.reset();
    }
    
    setupCapacitorListeners() {
        const { App, StatusBar, Style } = window.Capacitor.Plugins;
        StatusBar.setStyle({ style: this.settings.darkMode ? Style.Dark : Style.Light });
        App.addListener('backButton', () => {
            if (!this.dom.settingsModal.classList.contains('hidden')) { this.toggleSettingsModal(false); } 
            else { App.exitApp(); }
        });
    }

    setupDOMListeners() {
        if (!this.dom.settingsButton) {
            console.error('Settings button not found');
            return;
        }
        
        this.dom.boardSVG.addEventListener('click', (e) => { 
            if (e.target.classList.contains('hitbox')) {
                this.handlePositionClick(e.target);
            }
        });
        this.dom.resetButton.addEventListener('click', () => this.reset());
        this.dom.settingsButton.addEventListener('click', () => this.toggleSettingsModal(true));
        this.dom.closeSettingsBtn.addEventListener('click', () => this.toggleSettingsModal(false));
        this.dom.gametypeSetting.addEventListener('click', () => this.cycleGameType());
        this.dom.difficultySetting.addEventListener('click', () => this.cycleDifficulty());
        this.dom.hostGameBtn.addEventListener('click', () => this.hostGame());
        this.dom.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.dom.cancelHostBtn.addEventListener('click', () => this.cancelHost());
        if (this.dom.joinIpInput) {
            // Force uppercase and allow only A-Z0-9 characters as the user types
            // Limit to ROOM_CODE_LENGTH characters
            this.dom.joinIpInput.addEventListener('input', (e) => {
                let cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (cleaned.length > ROOM_CODE_LENGTH) {
                    cleaned = cleaned.substring(0, ROOM_CODE_LENGTH);
                }
                if (e.target.value !== cleaned) e.target.value = cleaned;
            });
        }
        this.dom.gamemodeSetting.addEventListener('click', () => this.cycleGameMode());
        this.dom.darkmodeSetting.addEventListener('click', () => this.toggleDarkMode());
        if (this.dom.downloadUpdateBtn) this.dom.downloadUpdateBtn.addEventListener('click', () => this.downloadUpdate());
        if (this.dom.dismissUpdateBtn) this.dom.dismissUpdateBtn.addEventListener('click', () => this.hideUpdateNotification());
        this.dom.player1.name.addEventListener('click', () => this.toggleNameEdit(true));
        this.dom.player1.nameInput.addEventListener('blur', () => this.toggleNameEdit(false));
        this.dom.player1.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.toggleNameEdit(false); });
        this.dom.namePromptConfirm.addEventListener('click', () => this.confirmNamePrompt());
        this.dom.namePromptCancel.addEventListener('click', () => this.closeNamePrompt());
        this.dom.namePromptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmNamePrompt(); });
        // Handle iOS keyboard visibility
        this.dom.namePromptInput.addEventListener('focus', () => {
            this.dom.namePromptModal.classList.add('input-focused');
            this.scrollInputIntoView();
        });
        this.dom.namePromptInput.addEventListener('blur', () => {
            this.dom.namePromptModal.classList.remove('input-focused');
        });
        if (this.dom.playAgainBtn) this.dom.playAgainBtn.addEventListener('click', () => this.playAgain());
        // Settings -> About panel
        this.dom.aboutRow = document.getElementById('about-row');
        this.dom.aboutPanel = document.getElementById('about-modal');
        this.dom.aboutBackBtn = document.getElementById('about-back-btn');
        this.dom.copyDebugBtn = document.getElementById('copy-debug-btn');
        this.dom.openRepoBtn = document.getElementById('open-repo-btn');
        this.dom.aboutGithub = document.getElementById('about-github');
        this.dom.debugBox = document.getElementById('debug-box');
        this.dom.aboutBuild = document.getElementById('about-build');
        if (this.dom.aboutRow) this.dom.aboutRow.addEventListener('click', () => this.showAboutPanel());
        if (this.dom.aboutBackBtn) this.dom.aboutBackBtn.addEventListener('click', () => this.hideAboutPanel());
        if (this.dom.copyDebugBtn) this.dom.copyDebugBtn.addEventListener('click', () => this.copyDebugInfo());
        if (this.dom.openRepoBtn) this.dom.openRepoBtn.addEventListener('click', () => { if (this.dom.aboutGithub) window.open(this.dom.aboutGithub.href, '_blank'); });
    }

    playAgain() {
        if (this.settings.gameType === 'network') {
            if (this.settings.networkRole === 'host') {
                // notify opponent via network that a reset is happening
                this.sendNetworkMessage({ type: 'game_event', payload: { type: 'reset' } }, true);
                // locally reset game-state but keep the connection
                this.reset(false);
                // host always starts after reset
                this.settings.isMyTurn = true;
                this.updateDisplay();
            } else {
                alert('Only the host can start a new networked game.');
            }
        } else {
            // For local games just perform a full reset
            this.reset(true);
        }
    }

    toggleNameEdit(isEditing, callback) {
        this.onNameSetCallback = callback || null;
        if (isEditing) {
            this.dom.player1.nameInput.value = this.player1Name === "You" ? "" : this.player1Name;
            this.dom.player1.name.classList.add('hidden');
            this.dom.player1.nameInput.classList.remove('hidden');
            this.dom.player1.nameInput.focus();
            this.dom.player1.nameInput.select();
        } else {
            let newName = this.dom.player1.nameInput.value.trim();
            // Sanitize and limit name length
            newName = newName.substring(0, MAX_NAME_LENGTH).replace(/[<>\"'&]/g, '');
            this.player1Name = newName || "You";
            this.dom.player1.name.classList.remove('hidden');
            this.dom.player1.nameInput.classList.add('hidden');
            this.saveSettings();
            this.updateDisplay();
            if (this.onNameSetCallback) { this.onNameSetCallback(); this.onNameSetCallback = null; }
        }
    }
    
    showUpdateNotification(info) { if (this.dom.updateNotification) { this.dom.updateMessage.textContent = `Update v${info.version} available`; this.dom.updateNotification.classList.add('show'); } }
    hideUpdateNotification() { if (this.dom.updateNotification) { this.dom.updateNotification.classList.remove('show'); } }
    
    downloadUpdate() {
        if (window.ipcRenderer) {
            window.ipcRenderer.send('open-download-page');
        } else if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { Browser } = window.Capacitor.Plugins;
            Browser.open({ url: 'https://github.com/suspiciousstew67/ninemensmorris/releases/latest' });
        }
        this.hideUpdateNotification();
    }
    
    ensurePlayerName(callback) {
        if (this.player1Name === "You") {
            this.showNamePrompt(callback);
        } else {
            callback();
        }
    }

    showNamePrompt(callback) {
        this.namePromptCallback = callback;
        this.dom.namePromptInput.value = '';
        this.dom.namePromptInput.placeholder = 'Your name';
        this.toggleNamePrompt(true);
        
        // Use setTimeout to ensure modal is visible before focusing
        setTimeout(() => {
            this.dom.namePromptInput.focus();
            // Scroll input into view on iOS
            this.scrollInputIntoView();
        }, 100);
    }

    scrollInputIntoView() {
        // Handle iOS keyboard overlap by scrolling input into view
        if (!this.dom.namePromptInput || !this.dom.namePromptModal) return;
        
        // Small delay to ensure keyboard animation has started
        setTimeout(() => {
            // Use scrollIntoView to ensure input is visible
            this.dom.namePromptInput.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
            
            // For iOS, use Visual Viewport API to handle keyboard properly
            if (window.visualViewport) {
                const handleViewportChange = () => {
                    const viewport = window.visualViewport;
                    const inputRect = this.dom.namePromptInput.getBoundingClientRect();
                    const viewportHeight = viewport.height;
                    const viewportTop = viewport.offsetTop;
                    
                    // Calculate if input is visible in the visual viewport
                    const inputTop = inputRect.top - viewportTop;
                    const inputBottom = inputRect.bottom - viewportTop;
                    
                    // If input is below the visible area, scroll the modal
                    if (inputBottom > viewportHeight - 20) {
                        const scrollNeeded = inputBottom - viewportHeight + 40;
                        const panel = this.dom.namePromptModal.querySelector('.name-prompt-panel');
                        if (panel) {
                            panel.scrollTop = Math.max(0, panel.scrollTop + scrollNeeded);
                        }
                    }
                };
                
                // Listen for viewport changes (keyboard appearing/disappearing)
                const resizeHandler = () => {
                    // Delay to allow keyboard animation
                    setTimeout(handleViewportChange, 100);
                };
                
                window.visualViewport.addEventListener('resize', resizeHandler);
                window.visualViewport.addEventListener('scroll', handleViewportChange);
                
                // Clean up listener when input loses focus
                const cleanup = () => {
                    window.visualViewport.removeEventListener('resize', resizeHandler);
                    window.visualViewport.removeEventListener('scroll', handleViewportChange);
                    this.dom.namePromptInput.removeEventListener('blur', cleanup);
                };
                this.dom.namePromptInput.addEventListener('blur', cleanup);
                
                // Initial check after a short delay
                setTimeout(handleViewportChange, 300);
            } else {
                // Fallback for browsers without Visual Viewport API
                // Scroll the modal container to show the input
                const panel = this.dom.namePromptModal.querySelector('.name-prompt-panel');
                if (panel) {
                    const inputOffset = this.dom.namePromptInput.offsetTop;
                    panel.scrollTop = Math.max(0, inputOffset - 100);
                }
            }
        }, 200);
    }

    closeNamePrompt() {
        this.toggleNamePrompt(false);
        if (this.namePromptCallback) {
            this.namePromptCallback();
            this.namePromptCallback = null;
        }
    }

    confirmNamePrompt() {
        let newName = this.dom.namePromptInput.value.trim();
        // Sanitize name: remove any potentially harmful characters and limit length
        newName = newName.substring(0, MAX_NAME_LENGTH).replace(/[<>\"'&]/g, '');
        if (newName.length > 0) {
            this.player1Name = newName;
            this.saveSettings();
            this.updateDisplay();
            this.closeNamePrompt();
        } else {
            this.dom.namePromptInput.style.borderColor = '#dc3545';
            setTimeout(() => {
                this.dom.namePromptInput.style.borderColor = '';
            }, 500);
        }
    }

    toggleNamePrompt(show) {
        if (!this.dom.namePromptModal) {
            console.error('Name prompt modal not found');
            return;
        }
        this.dom.namePromptModal.classList.toggle('hidden', !show);
    }

    setupNetworkConnection(isHost, roomCode = null) {
        try {
            // Set network role immediately based on connection type, not on received messages
            // This prevents role confusion from out-of-order or duplicate messages
            this.settings.networkRole = isHost ? 'host' : 'client';
            this.settings.gameType = 'network';
            
            this.networkSocket = new WebSocket(RELAY_SERVER_URL);
            
            if (isHost) {
                this.dom.networkActions.classList.add('hidden');
                this.dom.hostInfoPanel.classList.remove('hidden');
                this.dom.hostStatus.textContent = "Connecting to server...";
                this.dom.roomCodeDisplay.textContent = "----";
            }
            
            this.networkSocket.onopen = () => {
                console.log('WebSocket connected');
                // Flush any queued messages first
                this.flushMessageQueue();
                // Retry any pending messages waiting for acknowledgment
                this.retryPendingMessages();
                if (isHost) {
                    this.dom.hostStatus.textContent = "Waiting for opponent...";
                    this.sendNetworkMessage({ type: 'host', payload: { name: this.player1Name } });
                } else {
                    this.sendNetworkMessage({ type: 'join', payload: { name: this.player1Name, roomCode: roomCode } });
                }
                this.sendInitialPing();
                this.startKeepAlive();
                if (this.dom.pingIndicator) this.dom.pingIndicator.classList.remove('hidden');
            };
            
            this.networkSocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.hideJoiningRoomAlert();
                if (isHost) {
                    this.dom.hostStatus.textContent = "Connection failed. Retrying...";
                } else {
                    alert('Failed to connect. Please check the room code and try again.');
                    this.cancelHost();
                }
            };
            
            this.networkSocket.onmessage = (event) => {
                this.handleNetworkMessage(event);
            };
            
            this.networkSocket.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                this.hideJoiningRoomAlert();
                this.stopKeepAlive();
                if (this.settings.gameType === 'network' && !event.wasClean) {
                    if (isHost) {
                        this.dom.hostStatus.textContent = "Connection lost. Reconnecting...";
                        setTimeout(() => this.hostGame(), RECONNECT_DELAY);
                    } else {
                        alert('Connection lost. Please try again.');
                        this.cancelHost();
                    }
                }
            };
        } catch (error) {
            this.hideJoiningRoomAlert();
            console.error('Failed to setup network connection:', error);
            alert('Failed to establish connection. Please try again.');
            if (isHost) {
                this.cancelHost();
            }
        }
    }

    queueMessage(message) {
        const MAX_QUEUE_SIZE = 100;
        const MAX_MESSAGE_AGE = 30000; // 30 seconds
        
        // Limit queue size to prevent memory issues
        if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
            console.warn('Message queue is full, dropping oldest message');
            this.messageQueue.shift();
        }
        
        // Remove stale messages (older than MAX_MESSAGE_AGE)
        const now = Date.now();
        this.messageQueue = this.messageQueue.filter(msg => (now - msg.timestamp) < MAX_MESSAGE_AGE);
        
        // Add message to queue with unique ID and timestamp
        const queuedMessage = {
            id: ++this.messageIdCounter,
            message: message,
            timestamp: now
        };
        
        this.messageQueue.push(queuedMessage);
        console.log(`Message queued (ID: ${queuedMessage.id}, type: ${message.type}), queue size: ${this.messageQueue.length}`);
    }

    sendNetworkMessage(message, requiresAck = false) {
        // Add message ID for game events that require acknowledgment
        if (requiresAck && message.type === 'game_event') {
            const messageId = ++this.messageIdCounter;
            message.messageId = messageId;
            
            // Track this message as pending acknowledgment
            this.pendingMessages.set(messageId, {
                message: JSON.parse(JSON.stringify(message)), // Deep copy
                timestamp: Date.now(),
                retryCount: 0
            });
            
            // Set timeout to resend if not acknowledged
            setTimeout(() => {
                this.checkAndResendMessage(messageId);
            }, this.ackTimeout);
        }
        
        // If socket is open, try to send immediately
        if (this.networkSocket && this.networkSocket.readyState === WebSocket.OPEN) {
            try {
                this.networkSocket.send(JSON.stringify(message));
                if (requiresAck) {
                    console.log(`Sent message requiring ack (ID: ${message.messageId}, type: ${message.type})`);
                }
                return true;
            } catch (error) {
                console.error('Failed to send network message:', error);
                // If send fails, queue the message for retry
                if (requiresAck && message.messageId) {
                    // Keep in pendingMessages for retry
                    const pending = this.pendingMessages.get(message.messageId);
                    if (pending) {
                        pending.retryCount++;
                    }
                } else {
                    this.queueMessage(message);
                }
                return false;
            }
        } else {
            // Socket is not ready, queue the message
            if (requiresAck && message.messageId) {
                // Keep in pendingMessages, will retry when connection opens
                const pending = this.pendingMessages.get(message.messageId);
                if (pending) {
                    pending.retryCount++;
                }
            } else {
                this.queueMessage(message);
            }
            return false;
        }
    }
    
    checkAndResendMessage(messageId) {
        const pending = this.pendingMessages.get(messageId);
        if (!pending) {
            return; // Already acknowledged or removed
        }
        
        const age = Date.now() - pending.timestamp;
        const MAX_RETRIES = 5;
        const MAX_MESSAGE_AGE = 30000; // 30 seconds
        
        // Drop if too old
        if (age >= MAX_MESSAGE_AGE) {
            console.warn(`Dropping unacknowledged message (ID: ${messageId}, retries: ${pending.retryCount}, age: ${age}ms)`);
            this.pendingMessages.delete(messageId);
            return;
        }
        
        // Check retry count before incrementing
        if (pending.retryCount >= MAX_RETRIES) {
            console.warn(`Dropping unacknowledged message (ID: ${messageId}, max retries reached: ${pending.retryCount})`);
            this.pendingMessages.delete(messageId);
            return;
        }
        
        // Resend the message
        if (this.networkSocket && this.networkSocket.readyState === WebSocket.OPEN) {
            try {
                pending.retryCount++;
                pending.timestamp = Date.now(); // Update timestamp
                this.networkSocket.send(JSON.stringify(pending.message));
                console.log(`Resent unacknowledged message (ID: ${messageId}, retry: ${pending.retryCount})`);
                
                // Schedule next retry check if still not acknowledged
                setTimeout(() => {
                    this.checkAndResendMessage(messageId);
                }, this.ackTimeout);
            } catch (error) {
                console.error(`Failed to resend message (ID: ${messageId}):`, error);
                // Schedule retry again
                setTimeout(() => {
                    this.checkAndResendMessage(messageId);
                }, this.ackTimeout);
            }
        } else {
            // Socket not ready, try again later
            setTimeout(() => {
                this.checkAndResendMessage(messageId);
            }, 1000);
        }
    }
    
    acknowledgeMessage(messageId) {
        if (this.pendingMessages.has(messageId)) {
            console.log(`Message acknowledged (ID: ${messageId})`);
            this.pendingMessages.delete(messageId);
        }
    }
    
    retryPendingMessages() {
        // Retry all pending messages when connection is restored
        if (!this.networkSocket || this.networkSocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        const messageIds = Array.from(this.pendingMessages.keys());
        for (const messageId of messageIds) {
            this.checkAndResendMessage(messageId);
        }
    }

    flushMessageQueue() {
        if (!this.networkSocket || this.networkSocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        if (this.messageQueue.length === 0) {
            return;
        }
        
        const MAX_MESSAGE_AGE = 30000; // 30 seconds
        const now = Date.now();
        const messagesToSend = [];
        const messagesToKeep = [];
        
        // Separate messages into those to send and those to keep (stale messages)
        for (const queuedMsg of this.messageQueue) {
            const age = now - queuedMsg.timestamp;
            if (age >= MAX_MESSAGE_AGE) {
                console.warn(`Dropping stale message (ID: ${queuedMsg.id}, type: ${queuedMsg.message.type}, age: ${age}ms)`);
                continue; // Drop stale messages
            }
            messagesToSend.push(queuedMsg);
        }
        
        // Attempt to send each message
        for (const queuedMsg of messagesToSend) {
            try {
                this.networkSocket.send(JSON.stringify(queuedMsg.message));
                console.log(`Successfully sent queued message (ID: ${queuedMsg.id}, type: ${queuedMsg.message.type})`);
            } catch (error) {
                console.error(`Failed to send queued message (ID: ${queuedMsg.id}):`, error);
                // Keep failed messages for retry
                messagesToKeep.push(queuedMsg);
            }
        }
        
        // Update queue with only failed messages
        this.messageQueue = messagesToKeep;
        
        if (messagesToSend.length > 0) {
            console.log(`Flushed message queue: ${messagesToSend.length - messagesToKeep.length} sent, ${messagesToKeep.length} kept for retry`);
        }
    }

    sendInitialPing() {
        try {
            this.lastPingTime = Date.now();
            this.sendNetworkMessage({ type: 'ping' });
            console.debug('Sent initial ping');
        } catch (err) {
            console.warn('Failed to send initial ping', err);
        }
    }

    hostGame() {
        this.ensurePlayerName(() => {
            this.setupNetworkConnection(true);
        });
    }

    joinGame() {
        const roomCode = this.dom.joinIpInput.value.trim().toUpperCase();
        if (!roomCode || roomCode.length !== ROOM_CODE_LENGTH) {
            alert("Please enter a valid 4-character room code.");
            return;
        }
        // Validate room code contains only alphanumeric characters
        if (!/^[A-Z0-9]+$/.test(roomCode)) {
            alert("Room code must contain only letters and numbers.");
            return;
        }
        this.ensurePlayerName(() => {
            this.toggleSettingsModal(false);
            this.showJoiningRoomAlert();
            this.setupNetworkConnection(false, roomCode);
        });
    }
    
    showJoiningRoomAlert() {
        if (this.dom.joiningRoomAlert) {
            this.dom.joiningRoomAlert.classList.remove('hidden');
        }
    }
    
    hideJoiningRoomAlert() {
        if (this.dom.joiningRoomAlert) {
            this.dom.joiningRoomAlert.classList.add('hidden');
        }
    }
    
    startKeepAlive() {
        this.keepAliveInterval = setInterval(() => {
            if (this.networkSocket && this.networkSocket.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.sendNetworkMessage({ type: 'ping' });
                console.debug('Sent keepalive ping');
            }
        }, KEEP_ALIVE_INTERVAL);
        
        // Start periodic queue flush check (every 2 seconds)
        this.queueFlushInterval = setInterval(() => {
            if (this.messageQueue.length > 0) {
                this.flushMessageQueue();
            }
        }, 2000);
    }
    
    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.queueFlushInterval) {
            clearInterval(this.queueFlushInterval);
            this.queueFlushInterval = null;
        }
    }

    updatePingDisplay() {
        // Update ping value and bar indicator
        if (this.dom.pingValue) {
            this.dom.pingValue.textContent = this.currentPing;
        }
        if (this.dom.pingFill) {
            // Scale bar from 0-MAX_PING_DISPLAY: 0ms = 0%, MAX_PING_DISPLAY = 100%
            const percentage = Math.min((this.currentPing / MAX_PING_DISPLAY) * 100, 100);
            this.dom.pingFill.style.width = percentage + '%';
        }
    }

    cancelHost() {
        this.hideJoiningRoomAlert();
        if (this.networkSocket) { this.networkSocket.close(); this.networkSocket = null; }
        this.stopKeepAlive();
        this.currentPing = 0;
        // Clear message queue and pending messages when disconnecting
        this.messageQueue = [];
        this.pendingMessages.clear();
        this.receivedMessageIds.clear();
        if (this.dom.pingIndicator) {
            this.dom.pingIndicator.classList.add('hidden');
        }
        // hide inline ping bars (removed) — leave settings panel indicator hidden
        this.dom.hostInfoPanel.classList.add('hidden');
        this.dom.networkActions.classList.remove('hidden');
    }

    handleNetworkMessage(event) {
        try {
            if (!event.data) {
                console.warn('Received empty network message');
                return;
            }
            const message = JSON.parse(event.data);
            if (!message || !message.type) {
                console.warn('Received invalid network message format');
                return;
            }
            console.log('Network message received:', message.type);
            
            switch(message.type) {
                case 'host_success':
                    this.dom.roomCodeDisplay.textContent = message.payload.roomCode;
                    // Role already set in setupNetworkConnection, just confirm gameType
                    this.settings.gameType = 'network';
                    break;
                    
                case 'join_success':
                case 'opponent_joined':
                    this.hideJoiningRoomAlert();
                    this.player2Name = message.payload.opponentName || 'Opponent';
                    // Role already set in setupNetworkConnection, don't change it
                    // This prevents role confusion from out-of-order or duplicate messages
                    this.settings.gameType = 'network';
                    this.toggleSettingsModal(false);
                        // Update host status and show ping indicator when game starts
                        if (message.type === 'opponent_joined') {
                            this.dom.hostStatus.textContent = `${message.payload.opponentName || 'Opponent'} joined`;
                        } else if (message.type === 'join_success') {
                            this.dom.hostStatus.textContent = `Connected to ${message.payload.opponentName || 'Host'}`;
                        }
                        if (this.dom.pingIndicator) this.dom.pingIndicator.classList.remove('hidden');
                        this.reset(false);
                        // Ensure turn assignment: host always starts.
                        this.settings.isMyTurn = (this.settings.networkRole === 'host');
                        this.updateDisplay();
                    break;
                    
                case 'game_event':
                    console.log('Received game_event:', message);
                    // Check for duplicate messages
                    if (message.messageId) {
                        if (this.receivedMessageIds.has(message.messageId)) {
                            console.log(`Duplicate message received (ID: ${message.messageId}), ignoring`);
                            // Still send ack for duplicate to stop retries
                            this.sendNetworkMessage({ 
                                type: 'ack', 
                                messageId: message.messageId 
                            });
                            break;
                        }
                        this.receivedMessageIds.add(message.messageId);
                        
                        // Clean up old received IDs to prevent memory leak (keep last 1000)
                        if (this.receivedMessageIds.size > 1000) {
                            const idsArray = Array.from(this.receivedMessageIds);
                            this.receivedMessageIds = new Set(idsArray.slice(-500));
                        }
                    }
                    
                    if (!message.payload || !message.payload.type) {
                        console.warn('Invalid game_event: missing type or payload', message);
                        break;
                    }
                    const { type, payload } = message.payload;
                    console.log(`Processing game_event: type=${type}, payload=`, payload);
                    console.log(`Payload details: payload exists=${!!payload}, payload.to=${payload?.to}, typeof payload.to=${typeof payload?.to}, payload.from=${payload?.from}`);
                    try {
                        if(type === 'move') {
                            // Validate move payload: to must be a valid number, from must be null/undefined or valid number
                            if (payload && 
                                typeof payload.to === 'number' && 
                                payload.to >= 0 && 
                                payload.to < this.board.length &&
                                (payload.from == null || 
                                 (typeof payload.from === 'number' && 
                                  payload.from >= 0 && 
                                  payload.from < this.board.length))) {
                                console.log('Applying network move:', payload);
                                this.applyNetworkMove(payload);
                                
                                // Send acknowledgment AFTER successfully processing the move
                                if (message.messageId) {
                                    this.sendNetworkMessage({ 
                                        type: 'ack', 
                                        messageId: message.messageId 
                                    });
                                }
                            } else {
                                console.warn('Invalid move payload:', payload);
                                console.warn('Validation failed - payload:', payload, 'to:', payload?.to, 'from:', payload?.from, 'board.length:', this.board.length);
                            }
                        } else if(type === 'remove') {
                            if (payload !== null && payload !== undefined && typeof payload === 'number') {
                                console.log('Applying network remove:', payload);
                                this.applyNetworkRemove(payload);
                                
                                // Send acknowledgment AFTER successfully processing the remove
                                if (message.messageId) {
                                    this.sendNetworkMessage({ 
                                        type: 'ack', 
                                        messageId: message.messageId 
                                    });
                                }
                            } else {
                                console.warn('Invalid remove payload:', payload);
                            }
                        } else if(type === 'reset') { 
                            this.reset(false); 
                            alert('The host has started a new game.');
                            
                            // Send acknowledgment for reset
                            if (message.messageId) {
                                this.sendNetworkMessage({ 
                                    type: 'ack', 
                                    messageId: message.messageId 
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error processing game_event:', error);
                    }
                    break;
                    
                case 'ack':
                    // Handle acknowledgment message
                    if (message.messageId) {
                        this.acknowledgeMessage(message.messageId);
                    }
                    break;
                    
                case 'game_reset':
                    // Opponent initiated a reset
                    this.reset(false);
                    alert('Opponent started a new game.');
                    break;
                    
                case 'pong':
                    // Server acknowledged our ping - calculate latency
                    console.debug('Pong message received');
                    if (this.lastPingTime) {
                        this.currentPing = Date.now() - this.lastPingTime;
                        this.updatePingDisplay();
                        console.log(`Pong received - latency: ${this.currentPing}ms`);
                    } else {
                        // if we don't have lastPingTime, still show indicator
                        this.currentPing = 0;
                        this.updatePingDisplay();
                        console.log('Pong received but no lastPingTime recorded');
                    }
                    // Make sure settings-panel ping UI is visible when we receive pongs
                    if (this.dom.pingIndicator) this.dom.pingIndicator.classList.remove('hidden');
                    break;
                    
                case 'error':
                    this.hideJoiningRoomAlert();
                    console.error('Network error:', message.payload.message);
                    alert(`Error: ${message.payload.message}`);
                    this.cancelHost();
                    break;
                    
                case 'opponent_disconnected':
                    alert('Opponent has disconnected.');
                    this.settings.gameType = 'ai';
                    this.reset(false);
                    break;
                    
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing network message:', error);
        }
    }

    makeMove(move) {
        // Validate move
        if (!move || move.to === null || move.to === undefined || move.to === -1 || move.to < 0 || move.to >= this.board.length) {
            console.warn('Invalid move: invalid position', move);
            return;
        }
        if (this.board[move.to] !== null) {
            console.warn('Invalid move: position already occupied', move);
            return;
        }
        // Validate from only if it's provided (not null or undefined)
        if (move.from != null && (move.from < 0 || move.from >= this.board.length || this.board[move.from] !== this.currentPlayer)) {
            console.warn('Invalid move: invalid source position', move);
            return;
        }
        if (this.settings.gameType === 'network' && this.settings.isMyTurn) {
            this.sendNetworkMessage({ type: 'game_event', payload: { type: 'move', payload: move } }, true);
        }
        
        // Handle piece movement animation
        if (move.from !== null) {
            const fromPiece = this.dom.allPieces[move.from];
            if (fromPiece) {
                fromPiece.classList.add('moving');
            }
        }
        
        this.board[move.to] = this.currentPlayer;
        if (move.from != null) { 
            // Moving an existing piece (move.from is a number)
            this.board[move.from] = null;
            // Remove moving class after a short delay
            setTimeout(() => {
                const fromPiece = this.dom.allPieces[move.from];
                if (fromPiece) {
                    fromPiece.classList.remove('moving');
                }
            }, 100);
        } else { 
            // Placing a new piece (move.from is null or undefined)
            this.piecesLeft[this.currentPlayer]--; 
            this.piecesOnBoard[this.currentPlayer]++; 
        }
        
        this.updatePhase();
        // Render board first to update the DOM
        this.renderBoard();
        // Then trigger placement animation for new pieces only
        if (move.from === null) {
            // Trigger animation after a brief delay to ensure DOM is updated
            setTimeout(() => {
                this.animatePiecePlacement(move.to);
            }, 50);
        }
        
        const justMadeMill = this.isPositionInMill(move.to, this.currentPlayer);
        if (justMadeMill) {
            // Animate mill formation
            const millPattern = this.getMillPattern(move.to, this.currentPlayer);
            if (millPattern) {
                this.animateMillFormation(millPattern);
            }
        }
        
        if (this.settings.gameMode === 'simple') {
            // Update display first to show updated piece counts
            this.updateDisplay();
            if (justMadeMill) this.endGame(this.currentPlayer);
            else if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) this.endGame(null);
            else this.switchPlayer();
        } else {
            if (justMadeMill) { this.isRemovingPiece = true; this.updateDisplay(); }
            else { this.switchPlayer(); }
        }
    }

    handleRemovePiece(position) {
        const opponent = this.currentPlayer === 1 ? 2 : 1;
        if (this.board[position] === opponent && this.isRemovable(position, opponent)) {
            if(this.settings.gameType === 'network' && this.settings.isMyTurn) {
                this.sendNetworkMessage({ type: 'game_event', payload: { type: 'remove', payload: position } }, true);
            }
            // Animate piece removal
            this.animatePieceRemoval(position);
            // Delay board update to allow animation
            setTimeout(() => {
                this.board[position] = null;
                this.piecesOnBoard[opponent]--;
                this.renderBoard();
            }, 200);
            
            this.isRemovingPiece = false;
            if (this.gamePhase !== 'placing' && this.piecesOnBoard[opponent] < MIN_PIECES_TO_FLY) { 
                setTimeout(() => this.endGame(this.currentPlayer), 400);
            }
            else { 
                setTimeout(() => this.switchPlayer(), 400);
            }
        }
    }

    reset(sendNetworkEvent = true) {
        // If this reset was triggered locally and we're *not* trying to
        // signal the network (sendNetworkEvent === false), keep the
        // existing WebSocket open. This is used when the server tells us
        // a game has started (opponent joined) and we want to reset game
        // state but keep the connection.
        if (this.networkSocket && sendNetworkEvent) {
            this.networkSocket.onclose = null;
            this.networkSocket.close();
            this.networkSocket = null;
            // when connection is closed, show the default network UI
            this.dom.hostInfoPanel.classList.add('hidden');
            this.dom.networkActions.classList.remove('hidden');
            this.stopKeepAlive();
        } else if (!this.networkSocket) {
            // no socket at all: ensure UI shows network actions
            this.dom.hostInfoPanel.classList.add('hidden');
            this.dom.networkActions.classList.remove('hidden');
        }
        this.board.fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: INITIAL_PIECES, 2: INITIAL_PIECES };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.gameOver = false;
        this.isAIThinking = false;
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        this.winningPositions = [];
        // Only reset network role/turn when this is a full/local reset
        // (sendNetworkEvent === true). When called with sendNetworkEvent
        // === false we are performing a UI/game-state reset while keeping
        // the network session/role intact (e.g. at the start of a
        // networked game), so preserve those values.
        if (sendNetworkEvent) {
            this.settings.isMyTurn = true;
            this.settings.networkRole = 'none';
            this.player2Name = "Opponent";
        } else {
            // preserve existing network role & turn; ensure player2Name
            // has a sensible default if it wasn't set by the join message.
            this.player2Name = this.player2Name || "Opponent";
        }
        if (this.settings.gameType === 'ai') this.ai = new AIPlayer(this.settings.difficulty);
        else this.ai = null;
        this.updatePhase();
        this.updateDisplay();
        this.renderBoard();
        this.showAIThinking(false);
        // hide play again button until next game end
        if (this.dom.playAgainBtn) this.dom.playAgainBtn.classList.add('hidden');
    }
    
    updateDisplay() {
        let p1NameText = this.player1Name;
        let p2NameText = "Opponent";
        if (this.settings.gameType === 'ai') {
            const difficultyLabel = this.settings.difficulty === 'extreme' ? 'Extreme' : 
                                   this.settings.difficulty.charAt(0).toUpperCase() + this.settings.difficulty.slice(1);
            p2NameText = `${difficultyLabel} AI`;
        }
        if (this.settings.gameType === 'human') { p1NameText = 'Player 1'; p2NameText = 'Player 2'; }
        if (this.settings.gameType === 'network') {
            p1NameText = `${this.player1Name} (${this.settings.networkRole === 'host' ? 'Host' : 'Client'})`;
            p2NameText = this.player2Name;
        }
        if (this.isRemovingPiece && this.currentPlayer === 1) p1NameText = 'Remove a piece!';
        this.dom.player1.name.textContent = p1NameText;
        this.dom.player2.name.textContent = p2NameText;
        // Update piece indicator (but not when game is over - endGame() handles that)
        if (!this.gameOver) {
            // Remove winner/loser classes when updating during gameplay
            this.dom.player1.pieces.classList.remove('winner-text', 'loser-text');
            this.dom.player2.pieces.classList.remove('winner-text', 'loser-text');
            if (this.settings.gameMode === 'simple') {
                this.dom.player1.pieces.textContent = `${this.piecesLeft[1]} pieces left`;
                this.dom.player2.pieces.textContent = `${this.piecesLeft[2]} pieces left`;
            } else {
                const p1PiecesText = (this.gamePhase === 'placing' ? this.piecesLeft[1] : this.piecesOnBoard[1]) + (this.gamePhase === 'placing' ? ' left' : ' on board');
                const p2PiecesText = (this.gamePhase === 'placing' ? this.piecesLeft[2] : this.piecesOnBoard[2]) + (this.gamePhase === 'placing' ? ' left' : ' on board');
                this.dom.player1.pieces.textContent = p1PiecesText;
                this.dom.player2.pieces.textContent = p2PiecesText;
            }
        }
        const isClientInNetworkGame = this.settings.gameType === 'network' && this.settings.networkRole === 'client';
        this.dom.resetButton.disabled = isClientInNetworkGame;
        this.dom.resetButton.style.cursor = isClientInNetworkGame ? 'not-allowed' : 'pointer';
        this.dom.resetButton.style.opacity = isClientInNetworkGame ? '0.6' : '1';
        
        // Add active-turn class to current player's panel
        if (!this.gameOver) {
            if (this.currentPlayer === 1) {
                this.dom.player1.panel?.classList.add('active-turn');
                this.dom.player2.panel?.classList.remove('active-turn');
            } else {
                this.dom.player2.panel?.classList.add('active-turn');
                this.dom.player1.panel?.classList.remove('active-turn');
            }
        } else {
            this.dom.player1.panel?.classList.remove('active-turn');
            this.dom.player2.panel?.classList.remove('active-turn');
        }
    }

    handlePositionClick(target) {
        const isAITurn = this.settings.gameType === 'ai' && this.currentPlayer === 2;
        const isNetworkOpponentTurn = this.settings.gameType === 'network' && !this.settings.isMyTurn;
        if (isAITurn || isNetworkOpponentTurn || this.gameOver || this.isAIThinking) {
            return;
        }
        const position = parseInt(target.dataset.position);
        if (isNaN(position) || position < 0 || position >= this.board.length) {
            console.warn('Invalid position clicked:', position);
            return;
        }
        if (this.settings.gameMode === 'simple') {
            if (this.gamePhase === 'placing' && this.board[position] === null) {
                this.makeMove({ to: position });
            }
        } else {
            if (this.isRemovingPiece) {
                this.handleRemovePiece(position);
            } else if (this.gamePhase === 'placing') {
                if (this.board[position] === null) {
                    this.makeMove({ to: position });
                }
            } else {
                this.handleMovePiece(position);
            }
        }
    }

    applyNetworkMove(move) {
        console.log('applyNetworkMove called with:', move);
        const { from, to } = move;
        // Determine numeric player IDs: host = 1, client = 2
        const localPlayerNumber = this.settings.networkRole === 'host' ? 1 : (this.settings.networkRole === 'client' ? 2 : 1);
        const remotePlayer = localPlayerNumber === 1 ? 2 : 1;
        
        console.log(`applyNetworkMove: localPlayer=${localPlayerNumber}, remotePlayer=${remotePlayer}, from=${from}, to=${to}`);
        
        // Additional validation (defense in depth)
        if (to === null || to < 0 || to >= this.board.length || this.board[to] !== null) {
            console.warn('Invalid move target position:', to, 'board[to]=', this.board[to]);
            return;
        }
        if (from != null && (from < 0 || from >= this.board.length || this.board[from] !== remotePlayer)) {
            console.warn('Invalid move source position:', from);
            return;
        }
        
        // Apply the incoming move as the remote player's action
        console.log(`Applying move: board[${to}] = ${remotePlayer}`);
        this.board[to] = remotePlayer;
        if (from != null && from >= 0 && from < this.board.length) {
            this.board[from] = null;
        } else {
            this.piecesLeft[remotePlayer]--;
            this.piecesOnBoard[remotePlayer]++;
            console.log(`Placed new piece: piecesLeft[${remotePlayer}]=${this.piecesLeft[remotePlayer]}, piecesOnBoard[${remotePlayer}]=${this.piecesOnBoard[remotePlayer]}`);
        }
        this.updatePhase();
        console.log('Rendering board after network move');
        this.renderBoard();
        const justMadeMill = this.isPositionInMill(to, remotePlayer);
        if (this.settings.gameMode === 'simple') {
            // Update display first to show updated piece counts
            this.updateDisplay();
            if (justMadeMill) this.endGame(remotePlayer);
            else {
                // After remote's move it's the local player's turn
                this.currentPlayer = localPlayerNumber;
                this.settings.isMyTurn = true;
                this.updateDisplay();
            }
        } else {
            if (!justMadeMill) {
                this.currentPlayer = localPlayerNumber;
                this.settings.isMyTurn = true;
                this.updateDisplay();
            } else {
                // Remote formed a mill; they will send a 'remove' when they choose a piece.
                this.updateDisplay();
            }
        }
    }

    applyNetworkRemove(position) {
        // Determine player numbers for clarity
        const localPlayerNumber = this.settings.networkRole === 'host' ? 1 : (this.settings.networkRole === 'client' ? 2 : 1);
        const remotePlayer = localPlayerNumber === 1 ? 2 : 1;
        // Incoming remove means remote removed one of local player's pieces
        if (this.board[position] === localPlayerNumber) {
            this.board[position] = null;
            this.piecesOnBoard[localPlayerNumber]--;
        } else {
            // fallback: clear anyway
            this.board[position] = null;
        }
        if (this.gamePhase !== 'placing' && this.piecesOnBoard[localPlayerNumber] < MIN_PIECES_TO_FLY) {
            this.endGame(remotePlayer);
        } else {
            // After remote removed, it's local player's turn
            this.currentPlayer = localPlayerNumber;
            this.settings.isMyTurn = true;
            this.updateDisplay();
            this.renderBoard();
        }
    }

    switchPlayer() {
        if (this.gameOver) return;
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        if (this.settings.gameType === 'network') {
            this.settings.isMyTurn = !this.settings.isMyTurn;
        }
        if (this.settings.gameMode === 'classic' && this.gamePhase !== 'placing' && !this.hasValidMoves(this.currentPlayer)) {
            this.endGame(this.currentPlayer === 1 ? 2 : 1);
            return;
        }
        this.updateDisplay();
        if (this.settings.gameType === 'ai' && this.currentPlayer === 2 && !this.gameOver) {
            this.makeAIMove();
        }
    }

    async makeAIMove() {
        if (!this.ai || this.gameOver) return;
        this.isAIThinking = true;
        this.showAIThinking(true);
        const thinkingDelay = AI_THINKING_DELAY_MIN + Math.random() * (AI_THINKING_DELAY_MAX - AI_THINKING_DELAY_MIN);
        await new Promise(resolve => setTimeout(resolve, thinkingDelay));
        try {
            // Make AI move async to allow for Web Workers/parallel processing
            const aiMove = await this.ai.makeMove(this);
            this.isAIThinking = false;
            this.showAIThinking(false);
            if (aiMove && aiMove.to !== null && aiMove.to !== undefined && aiMove.to >= 0 && aiMove.to < 24) {
                this.makeMove(aiMove);
                if (aiMove.remove !== null && aiMove.remove !== undefined) {
                    await new Promise(resolve => setTimeout(resolve, AI_REMOVE_DELAY));
                    this.handleRemovePiece(aiMove.remove);
                }
            } else {
                console.warn('AI returned invalid move:', aiMove);
                this.isAIThinking = false;
                this.showAIThinking(false);
            }
        } catch (error) {
            console.error('Error in makeAIMove:', error);
            this.isAIThinking = false;
            this.showAIThinking(false);
        }
    }

    showAIThinking(show) {
        this.dom.player2.panel.classList.toggle('thinking', show);
    }

    handleMovePiece(position) {
        if (this.selectedPiece === null) {
            if (this.board[position] === this.currentPlayer) {
                this.selectedPiece = position;
                this.renderBoard();
            }
        } else {
            const canFly = this.piecesOnBoard[this.currentPlayer] === MIN_PIECES_TO_FLY;
            const isValid = (canFly) ? this.board[position] === null : this.adjacencyMap[this.selectedPiece].includes(position) && this.board[position] === null;
            if (isValid) {
                const move = { from: this.selectedPiece, to: position };
                this.selectedPiece = null;
                this.makeMove(move);
            } else {
                this.selectedPiece = null;
                this.renderBoard();
            }
        }
    }

    updatePhase() {
        if (this.piecesLeft[1] > 0 || this.piecesLeft[2] > 0) this.gamePhase = 'placing';
        else this.gamePhase = 'moving';
    }

    isRemovable(position, player) {
        if (!this.isPositionInMill(position, player)) return true;
        const allPieces = [...this.board.keys()].filter(p => this.board[p] === player);
        const nonMillPieces = allPieces.filter(p => !this.isPositionInMill(p, player));
        return nonMillPieces.length === 0;
    }

    isPositionInMill(position, player, board = this.board) {
        if (position === null || player === null) return false;
        return this.millPatterns.some(pattern => pattern.includes(position) && pattern.every(p => board[p] === player));
    }

    getMillPattern(position, player) {
        return this.millPatterns.find(pattern => pattern.includes(position) && pattern.every(p => this.board[p] === player));
    }

    hasValidMoves(player) {
        if (this.gamePhase === 'placing') return this.board.includes(null);
        if (this.piecesOnBoard[player] === MIN_PIECES_TO_FLY) return this.board.includes(null);
        const playerPieces = [...this.board.keys()].filter(i => this.board[i] === player);
        return playerPieces.some(pos => this.adjacencyMap[pos].some(adj => this.board[adj] === null));
    }

    renderBoard() {
        this.dom.allPieces.forEach((piece, index) => {
            let classes = 'piece';
            const wasOccupied = piece.classList.contains('occupied');
            const isNowOccupied = this.board[index] !== null;
            
            if (isNowOccupied) {
                classes += ` occupied player${this.board[index]}`;
            }
            
            if (this.gameOver && this.winningPositions.includes(index)) {
                classes += ' winning-position';
            }
            if (this.selectedPiece === index) {
                classes += ' selected';
            }
            
            piece.setAttribute('class', classes);
        });
        
        this.dom.allHitboxes.forEach((hitbox, index) => {
            const opponent = this.currentPlayer === 1 ? 2 : 1;
            hitbox.classList.toggle('removable', this.isRemovingPiece && this.board[index] === opponent && this.isRemovable(index, opponent));
        });
    }
    
    animatePiecePlacement(position) {
        if (position < 0 || position >= this.dom.allPieces.length) return;
        const piece = this.dom.allPieces[position];
        if (piece && piece.classList.contains('occupied')) {
            // Add a temporary class to trigger animation without removing occupied
            piece.classList.add('placing-animation');
            // Remove after animation completes
            setTimeout(() => {
                if (piece) {
                    piece.classList.remove('placing-animation');
                }
            }, 400);
        }
    }
    
    animatePieceRemoval(position) {
        const piece = this.dom.allPieces[position];
        if (piece) {
            piece.classList.add('removing');
            // Remove the piece from board after animation
            setTimeout(() => {
                piece.classList.remove('removing', 'occupied', 'player1', 'player2');
            }, 400);
        }
    }
    
    animateMillFormation(positions) {
        positions.forEach(position => {
            const piece = this.dom.allPieces[position];
            if (piece) {
                piece.classList.add('mill-formation');
                setTimeout(() => {
                    piece.classList.remove('mill-formation');
                }, 600);
            }
        });
    }

    cycleGameType() {
        const currentIndex = this.availableGameTypes.indexOf(this.settings.gameType);
        this.settings.gameType = this.availableGameTypes[(currentIndex + 1) % this.availableGameTypes.length];
        this.saveSettings();
        this.updateSettingsDisplay();
        this.reset();
    }

    cycleDifficulty() {
        const currentIndex = this.availableDifficulties.indexOf(this.settings.difficulty);
        this.settings.difficulty = this.availableDifficulties[(currentIndex + 1) % this.availableDifficulties.length];
        this.saveSettings();
        this.updateSettingsDisplay();
        this.reset();
    }

    cycleGameMode() {
        const currentIndex = this.availableGameModes.indexOf(this.settings.gameMode);
        this.settings.gameMode = this.availableGameModes[(currentIndex + 1) % this.availableGameModes.length];
        this.saveSettings();
        this.updateSettingsDisplay();
        this.reset();
    }

    toggleDarkMode() {
        this.settings.darkMode = !this.settings.darkMode;
        this.saveSettings();
        this.applySettings();
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { StatusBar, Style } = window.Capacitor.Plugins;
            StatusBar.setStyle({ style: this.settings.darkMode ? Style.Dark : Style.Light });
        }
    }

    toggleSettingsModal(show) {
        if (!this.dom.settingsModal) {
            console.error('Settings modal not found');
            return;
        }
        
        if (show) {
            // Remove hidden class first to make modal visible
            this.dom.settingsModal.classList.remove('hidden');
            
            // Use requestAnimationFrame to ensure smooth transition
            requestAnimationFrame(() => {
                // Reset animations when opening modal
                const settingsOptions = this.dom.settingsModal.querySelector('.settings-options');
                if (settingsOptions) {
                    settingsOptions.style.display = 'flex';
                    settingsOptions.style.animation = '';
                    // Force reflow to restart animations
                    void settingsOptions.offsetWidth;
                }
                // Ensure about panel is hidden
                if (this.dom.aboutPanel) {
                    this.dom.aboutPanel.classList.add('hidden');
                    this.dom.aboutPanel.style.animation = '';
                }
                this.updateSettingsDisplay();
            });
        } else {
            // Add hidden class to trigger close animation
            this.dom.settingsModal.classList.add('hidden');
        }
    }

    updateSettingsDisplay() {
        const gameTypeLabels = { ai: 'vs. AI', human: 'vs. Human', network: 'Network' };
        this.animateSettingValue(this.dom.gametypeValue, gameTypeLabels[this.settings.gameType]);
        
        const difficultyLabel = this.settings.difficulty.charAt(0).toUpperCase() + this.settings.difficulty.slice(1);
        this.animateSettingValue(this.dom.difficultyValue, difficultyLabel);
        
        const gameModeLabel = this.settings.gameMode.charAt(0).toUpperCase() + this.settings.gameMode.slice(1);
        this.animateSettingValue(this.dom.gamemodeValue, gameModeLabel);
        
        this.animateSettingValue(this.dom.darkmodeValue, this.settings.darkMode ? 'On' : 'Off');
        
        const isNetworkMode = this.settings.gameType === 'network';
        this.dom.difficultySetting.style.display = isNetworkMode ? 'none' : '';
        this.dom.networkSettings.classList.toggle('hidden', !isNetworkMode);
        // If About panel is visible while switching settings, ensure it's hidden
        if (this.dom.aboutPanel && !this.dom.aboutPanel.classList.contains('hidden')) {
            this.dom.aboutPanel.classList.add('hidden');
        }
    }

    animateSettingValue(element, newValue) {
        if (!element) return;
        // Add animation class
        const parentRow = element.closest('.setting-row');
        if (parentRow) {
            parentRow.classList.add('changing');
        }
        // Update value after a brief delay for animation
        setTimeout(() => {
            element.textContent = newValue;
            if (parentRow) {
                setTimeout(() => {
                    parentRow.classList.remove('changing');
                }, 400);
            }
        }, 50);
    }

    showAboutPanel() {
        if (!this.dom.aboutPanel) return;
        // populate debug info
        const debug = {
            time: new Date().toISOString(),
            userAgent: navigator.userAgent,
            gameType: this.settings.gameType,
            networkRole: this.settings.networkRole,
            isMyTurn: this.settings.isMyTurn,
            roomCode: (this.dom.roomCodeDisplay && this.dom.roomCodeDisplay.textContent) ? this.dom.roomCodeDisplay.textContent : null,
            currentPing: this.currentPing,
            socketReadyState: this.networkSocket ? this.networkSocket.readyState : null,
            piecesLeft: this.piecesLeft,
        };
        if (this.dom.debugBox) this.dom.debugBox.textContent = JSON.stringify(debug, null, 2);
        if (this.dom.aboutBuild) this.dom.aboutBuild.textContent = 'dev';
        // Hide settings options with animation
        const settingsOptions = this.dom.settingsModal?.querySelector('.settings-options');
        if (settingsOptions) {
            settingsOptions.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                settingsOptions.style.display = 'none';
            }, 300);
        }
        // show about panel with animation
        this.dom.aboutPanel.classList.remove('hidden');
    }

    hideAboutPanel() {
        if (!this.dom.aboutPanel) return;
        // Hide about panel with animation
        this.dom.aboutPanel.style.animation = 'slideOutToRight 0.3s ease-out forwards';
        setTimeout(() => {
            this.dom.aboutPanel.classList.add('hidden');
            this.dom.aboutPanel.style.animation = '';
            // Show settings options again
            const settingsOptions = this.dom.settingsModal?.querySelector('.settings-options');
            if (settingsOptions) {
                settingsOptions.style.display = 'flex';
                settingsOptions.style.animation = 'fadeInUp 0.4s ease-out 0.15s both';
            }
        }, 300);
    }

    // TEST/DEBUG: Simulate update notification for testing
    testShowUpdateNotification(version = '2.0.0') {
        this.showUpdateNotification({ version });
        console.log(`[TEST] Update notification triggered for v${version}`);
    }

    // TEST/DEBUG: Hide the update notification
    testHideUpdateNotification() {
        this.hideUpdateNotification();
        console.log('[TEST] Update notification hidden');
    }

    async copyDebugInfo() {
        if (!this.dom.debugBox) return;
        try {
            await navigator.clipboard.writeText(this.dom.debugBox.textContent);
            alert('Debug info copied to clipboard');
        } catch (err) {
            console.error('Copy failed', err);
            alert('Unable to copy debug info');
        }
    }

    endGame(winner) {
        if (this.gameOver) return;
        this.isRemovingPiece = false;
        this.showAIThinking(false);
        // Update display first to show final piece counts before showing winner
        // (call before setting gameOver = true so piece counts update)
        this.updateDisplay();
        // Now mark game as over and set winner/loser/draw text
        this.gameOver = true;
        if (winner === 1) {
            this.dom.player1.pieces.textContent = "Winner!";
            this.dom.player1.pieces.classList.add('winner-text');
            this.dom.player2.pieces.textContent = "Loser!";
            this.dom.player2.pieces.classList.add('loser-text');
            this.launchConfetti();
        } else if (winner === 2) {
            this.dom.player1.pieces.textContent = "Loser!";
            this.dom.player1.pieces.classList.add('loser-text');
            this.dom.player2.pieces.textContent = "Winner!";
            this.dom.player2.pieces.classList.add('winner-text');
        } else {
            this.dom.player1.pieces.textContent = "Draw!";
            this.dom.player2.pieces.textContent = "Draw!";
        }
        this.renderBoard();
        // Remove active-turn classes
        this.dom.player1.panel?.classList.remove('active-turn');
        this.dom.player2.panel?.classList.remove('active-turn');
        // Show Play Again button only for network games (host can restart)
        if (this.dom.playAgainBtn) {
            if (this.settings.gameType === 'network') {
                this.dom.playAgainBtn.classList.remove('hidden');
            }
        }
    }

    launchConfetti() {
        this.dom.confettiContainer.innerHTML = '';
        for (let i = 0; i < CONFETTI_COUNT; i++) {
            const c = document.createElement('div');
            c.className = 'confetti animate';
            c.style.background = `hsl(${Math.random() * 360}, 90%, 65%)`;
            c.style.left = `${Math.random() * 100}vw`;
            c.style.animationDuration = `${2 + Math.random() * 3}s`;
            c.style.animationDelay = `${Math.random() * 0.2}s`;
            c.addEventListener('animationend', () => c.remove());
            this.dom.confettiContainer.appendChild(c);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new NineMensMorrisGame();
    game.initialize();
    window.game = game;
});