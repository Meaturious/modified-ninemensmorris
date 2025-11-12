// START OF FINAL SCRIPT.JS
const AIPlayer = window.AIPlayer;

class NineMensMorrisGame {
    constructor() {
        this.board = Array(24).fill(null);
        this.currentPlayer = 1;
        this.gameOver = false;
        this.isAIThinking = false;
        this.isWaitingForConnection = false;

        this.player1Name = "You";
        this.player2Name = "Opponent";
        
        this.onNameSetCallback = null;

        this.settings = {
            difficulty: 'hard',
            gameType: 'ai', 
            gameMode: 'classic',
            darkMode: true,
            networkRole: 'none',
            isMyTurn: true,
        };
        
        this.availableGameTypes = ['ai', 'human'];
        if (window.ipcRenderer) {
            this.availableGameTypes.push('network');
        }
        
        this.loadSettings();

        this.gamePhase = 'placing';
        this.piecesLeft = { 1: 9, 2: 9 };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        this.winningPositions = [];
        
        this.availableDifficulties = ['easy', 'medium', 'hard'];
        this.availableGameModes = ['simple', 'classic'];

        this.ai = null;
        this.millPatterns = [[0,1,2],[2,3,4],[4,5,6],[6,7,0],[8,9,10],[10,11,12],[12,13,14],[14,15,8],[16,17,18],[18,19,20],[20,21,22],[22,23,16],[1,9,17],[3,11,19],[5,13,21],[7,15,23]];
        this.adjacencyMap = { 0:[1,7],1:[0,2,9],2:[1,3],3:[2,4,11],4:[3,5],5:[4,6,13],6:[5,7],7:[0,6,15],8:[9,15],9:[1,8,10,17],10:[9,11],11:[3,10,12,19],12:[11,13],13:[5,12,14,21],14:[13,15],15:[7,8,14,23],16:[17,23],17:[9,16,18],18:[17,19],19:[11,18,20],20:[19,21],21:[13,20,22],22:[21,23],23:[15,16,22] };

        this.dom = {
            player1: { name: document.getElementById('player1-name'), pieces: document.getElementById('player1-pieces'), nameInput: document.getElementById('player1-name-input') },
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
            networkSettings: document.getElementById('network-settings'),
            hostGameBtn: document.getElementById('host-game-btn'),
            hostInfo: document.getElementById('host-info'),
            joinIpInput: document.getElementById('join-ip-input'),
            joinGameBtn: document.getElementById('join-game-btn'),
            gamemodeSetting: document.getElementById('gamemode-setting'),
            gamemodeValue: document.getElementById('gamemode-value'),
            darkmodeSetting: document.getElementById('darkmode-setting'),
            darkmodeValue: document.getElementById('darkmode-value'),
            updateNotification: document.getElementById('update-notification'),
            updateMessage: document.getElementById('update-message'),
            downloadUpdateBtn: document.getElementById('download-update-btn'),
            dismissUpdateBtn: document.getElementById('dismiss-update-btn'),
        };
    }
    
    saveSettings() {
        const settingsToSave = {
            gameType: this.settings.gameType,
            difficulty: this.settings.difficulty,
            gameMode: this.settings.gameMode,
            darkMode: this.settings.darkMode,
            player1Name: this.player1Name,
        };
        localStorage.setItem('nineMensMorrisSettings', JSON.stringify(settingsToSave));
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('nineMensMorrisSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            this.settings.gameType = parsed.gameType || 'ai';
            this.settings.difficulty = parsed.difficulty || 'hard';
            this.settings.gameMode = parsed.gameMode || 'classic';
            this.settings.darkMode = parsed.darkMode !== undefined ? parsed.darkMode : true;
            this.player1Name = parsed.player1Name || 'You';
            
            if (this.settings.gameType === 'network' && !window.ipcRenderer) {
                this.settings.gameType = 'ai';
            }
        }
    }
    
    applySettings() {
        document.body.classList.toggle('light-mode', !this.settings.darkMode);
        this.updateSettingsDisplay();
    }

    initialize() {
        this.applySettings();
        this.setupDOMListeners();
        this.setupUpdateListener();
        this.setupNetworkListeners();
        this.reset();
    }
    
    setupDOMListeners() {
        this.dom.boardSVG.addEventListener('click', (e) => { if (e.target.classList.contains('hitbox')) this.handlePositionClick(e.target); });
        this.dom.resetButton.addEventListener('click', () => this.reset());
        this.dom.settingsButton.addEventListener('click', () => this.toggleSettingsModal(true));
        this.dom.closeSettingsBtn.addEventListener('click', () => this.toggleSettingsModal(false));
        this.dom.gametypeSetting.addEventListener('click', () => this.cycleGameType());
        this.dom.difficultySetting.addEventListener('click', () => this.cycleDifficulty());
        this.dom.hostGameBtn.addEventListener('click', () => this.hostGame());
        this.dom.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.dom.gamemodeSetting.addEventListener('click', () => this.cycleGameMode());
        this.dom.darkmodeSetting.addEventListener('click', () => this.toggleDarkMode());
        if (this.dom.downloadUpdateBtn) this.dom.downloadUpdateBtn.addEventListener('click', () => this.downloadUpdate());
        if (this.dom.dismissUpdateBtn) this.dom.dismissUpdateBtn.addEventListener('click', () => this.hideUpdateNotification());
        
        this.dom.player1.name.addEventListener('click', () => this.toggleNameEdit(true));
        this.dom.player1.nameInput.addEventListener('blur', () => this.toggleNameEdit(false));
        this.dom.player1.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.toggleNameEdit(false); });
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
            const newName = this.dom.player1.nameInput.value.trim();
            this.player1Name = newName || "You";
            this.dom.player1.name.classList.remove('hidden');
            this.dom.player1.nameInput.classList.add('hidden');
            this.saveSettings();
            this.updateDisplay();

            if (this.onNameSetCallback) {
                this.onNameSetCallback();
                this.onNameSetCallback = null;
            }
        }
    }
    
    setupUpdateListener() { if (window.ipcRenderer) window.ipcRenderer.on('update-info-available', (info) => this.showUpdateNotification(info)); }
    
    showUpdateNotification(info) {
        if (this.dom.updateNotification && this.dom.updateMessage) {
            this.dom.updateMessage.textContent = `Update v${info.version} available`;
            this.dom.updateNotification.classList.add('show');
        }
    }

    hideUpdateNotification() {
         if (this.dom.updateNotification) {
            this.dom.updateNotification.classList.remove('show');
        }
    }
    downloadUpdate() { if (window.ipcRenderer) window.ipcRenderer.send('open-download-page'); this.hideUpdateNotification(); }
    
    setupNetworkListeners() {
        if (!window.ipcRenderer) return;

        window.ipcRenderer.on('network-status-update', (data) => {
            this.isWaitingForConnection = false; 

            if (data.status === 'connected') {
                this.settings.networkRole = data.role;
                this.reset(false);
                this.toggleSettingsModal(false);
                window.ipcRenderer.send('send-network-event', { type: 'name_sync', payload: { name: this.player1Name } });
            } else if (data.status === 'disconnected') {
                alert('Opponent has disconnected.');
                this.settings.gameType = 'ai';
                this.reset(false);
            } else if (data.status === 'error') {
                alert(data.message);
                this.toggleSettingsModal(true);
            }
        });

        window.ipcRenderer.on('network-event', (eventData) => {
            switch(eventData.type) {
                case 'move': this.applyNetworkMove(eventData.payload); break;
                case 'remove': this.applyNetworkRemove(eventData.payload); break;
                case 'reset': this.reset(false); alert('The host has started a new game.'); break;
                case 'name_sync':
                    this.player2Name = eventData.payload.name;
                    this.updateDisplay();
                    break;
            }
        });
    }

    ensurePlayerName(callback) {
        if (this.player1Name === "You") {
            this.toggleSettingsModal(false);
            setTimeout(() => this.toggleNameEdit(true, callback), 150);
        } else {
            callback();
        }
    }

    hostGame() {
        this.ensurePlayerName(async () => {
            this.toggleSettingsModal(false);
            if (window.ipcRenderer) {
                const ip = await window.ipcRenderer.invoke('get-local-ip');
                this.isWaitingForConnection = true; 
                alert(`Waiting for opponent to connect at: ${ip}:8080`);
                window.ipcRenderer.send('host-game');
            }
        });
    }

    joinGame() {
        const ip = this.dom.joinIpInput.value;
        if (!ip) { alert("Please enter the host's IP address."); return; }
        this.ensurePlayerName(() => this.actuallyJoinGame(ip));
    }
    
    actuallyJoinGame(ip) {
        this.toggleSettingsModal(false);
        if (window.ipcRenderer) {
            alert(`Connecting to ${ip}...`);
            window.ipcRenderer.send('join-game', ip);
        }
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
    }
    
    toggleSettingsModal(show) {
        this.dom.settingsModal.classList.toggle('hidden', !show);
        if (show) this.updateSettingsDisplay();
    }

    updateSettingsDisplay() {
        const gameTypeMap = { ai: 'vs. AI', human: 'vs. Human (Local)', network: 'vs. Human (Network)' };
        this.dom.gametypeValue.textContent = gameTypeMap[this.settings.gameType];
        this.dom.difficultyValue.textContent = this.settings.difficulty.charAt(0).toUpperCase() + this.settings.difficulty.slice(1);
        this.dom.gamemodeValue.textContent = this.settings.gameMode.charAt(0).toUpperCase() + this.settings.gameMode.slice(1);
        this.dom.darkmodeValue.textContent = this.settings.darkMode ? 'On' : 'Off';
        this.dom.difficultySetting.style.display = this.settings.gameType === 'ai' ? 'flex' : 'none';
        this.dom.networkSettings.classList.toggle('hidden', this.settings.gameType !== 'network');
        if (this.settings.gameType !== 'network') this.dom.hostInfo.classList.add('hidden');
    }
    
    handlePositionClick(target) {
        const isAITurn = this.settings.gameType === 'ai' && this.currentPlayer === 2;
        const isNetworkOpponentTurn = this.settings.gameType === 'network' && !this.settings.isMyTurn;

        if (this.isWaitingForConnection || isAITurn || isNetworkOpponentTurn || this.gameOver || this.isAIThinking) {
            return;
        }

        const position = parseInt(target.dataset.position);

        if (this.settings.gameMode === 'simple') {
            if (this.gamePhase === 'placing' && this.board[position] === null) this.makeMove({ to: position });
        } else {
            if (this.isRemovingPiece) this.handleRemovePiece(position);
            else if (this.gamePhase === 'placing') { if (this.board[position] === null) this.makeMove({ to: position }); }
            else this.handleMovePiece(position);
        }
    }

    makeMove(move) {
        if (move.to === null || move.to === -1 || this.board[move.to] !== null) return;

        if (this.settings.gameType === 'network' && this.settings.isMyTurn) {
            window.ipcRenderer.send('send-network-event', { type: 'move', payload: move });
        }

        this.board[move.to] = this.currentPlayer;
        if (move.from !== undefined && move.from !== null) { this.board[move.from] = null; }
        else {
            this.piecesLeft[this.currentPlayer]--;
            this.piecesOnBoard[this.currentPlayer]++;
        }
        
        this.updatePhase();
        this.renderBoard();
        
        const justMadeMill = this.isPositionInMill(move.to, this.currentPlayer);

        if (this.settings.gameMode === 'simple') {
            if (justMadeMill) this.endGame(this.currentPlayer);
            else if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) this.endGame(null);
            else this.switchPlayer();
        } else {
            if (justMadeMill) {
                this.isRemovingPiece = true;
                this.updateDisplay();
            } else {
                this.switchPlayer();
            }
        }
    }
    
    applyNetworkMove(move) {
        const { from, to } = move;
        if (to === null || this.board[to] !== null) return;
        
        this.board[to] = this.currentPlayer;
        if (from !== undefined && from !== null) { this.board[from] = null; }
        else {
            this.piecesLeft[this.currentPlayer]--;
            this.piecesOnBoard[this.currentPlayer]++;
        }
        this.updatePhase();
        this.renderBoard();
        
        const justMadeMill = this.isPositionInMill(to, this.currentPlayer);

        if (this.settings.gameMode === 'simple') {
             if (justMadeMill) this.endGame(this.currentPlayer);
             else this.switchPlayer();
        } else {
            if (!justMadeMill) {
                this.switchPlayer();
            } else {
                this.updateDisplay();
            }
        }
    }

    applyNetworkRemove(position) {
        this.board[position] = null;
        this.piecesOnBoard[this.currentPlayer === 1 ? 2 : 1]--;
        
        if (this.gamePhase !== 'placing' && this.piecesOnBoard[this.currentPlayer === 1 ? 2 : 1] < 3) {
            this.endGame(this.currentPlayer);
        } else {
            this.switchPlayer();
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
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 400));
        
        const aiMove = this.ai.makeMove(this);
        
        this.isAIThinking = false;
        this.showAIThinking(false);
        
        if (aiMove && aiMove.to !== null) {
            this.makeMove(aiMove);
            if (aiMove.remove !== null) {
                await new Promise(resolve => setTimeout(resolve, 400));
                this.handleRemovePiece(aiMove.remove);
            }
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
            const canFly = this.piecesOnBoard[this.currentPlayer] === 3;
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

    handleRemovePiece(position) {
        const opponent = this.currentPlayer === 1 ? 2 : 1;
        if (this.board[position] === opponent && this.isRemovable(position, opponent)) {
            if(this.settings.gameType === 'network' && this.settings.isMyTurn) {
                window.ipcRenderer.send('send-network-event', { type: 'remove', payload: position });
            }
            this.board[position] = null;
            this.piecesOnBoard[opponent]--;
            this.isRemovingPiece = false;
            
            if (this.gamePhase !== 'placing' && this.piecesOnBoard[opponent] < 3) {
                this.endGame(this.currentPlayer);
            } else {
                this.switchPlayer();
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
        if (this.piecesOnBoard[player] === 3) return this.board.includes(null);
        const playerPieces = [...this.board.keys()].filter(i => this.board[i] === player);
        return playerPieces.some(pos => this.adjacencyMap[pos].some(adj => this.board[adj] === null));
    }
    renderBoard() {
        this.dom.allPieces.forEach((piece, index) => {
            let classes = 'piece';
            if (this.board[index] !== null) classes += ` occupied player${this.board[index]}`;
            if (this.gameOver && this.winningPositions && this.winningPositions.includes(index)) classes += ' winning-position';
            if (this.selectedPiece === index) classes += ' selected';
            piece.setAttribute('class', classes);
        });
        this.dom.allHitboxes.forEach((hitbox, index) => {
            const opponent = this.currentPlayer === 1 ? 2 : 1;
            hitbox.classList.toggle('removable', this.isRemovingPiece && this.board[index] === opponent && this.isRemovable(index, opponent));
        });
    }

    updateDisplay() {
        let p1NameText = this.player1Name;
        let p2NameText = "Opponent";
        
        if (this.settings.gameType === 'ai') p2NameText = `${this.settings.difficulty.charAt(0).toUpperCase() + this.settings.difficulty.slice(1)} AI`;
        if (this.settings.gameType === 'human') { p1NameText = 'Player 1'; p2NameText = 'Player 2'; }
        if (this.settings.gameType === 'network') {
            p1NameText = `${this.player1Name} (${this.settings.networkRole === 'host' ? 'Host' : 'Client'})`;
            p2NameText = this.player2Name;
        }
        
        if (this.isRemovingPiece && this.currentPlayer === 1) p1NameText = 'Remove a piece!';
        
        this.dom.player1.name.textContent = p1NameText;
        this.dom.player2.name.textContent = p2NameText;
        
        this.dom.player1.pieces.classList.remove('winner-text', 'loser-text');
        this.dom.player2.pieces.classList.remove('winner-text', 'loser-text');

        const p1PiecesText = this.settings.gameMode === 'classic' ? (`${this.gamePhase === 'placing' ? this.piecesLeft[1] : this.piecesOnBoard[1]} ${this.gamePhase === 'placing' ? 'left' : 'on board'}`) : `${this.piecesLeft[1]} pieces left`;
        const p2PiecesText = this.settings.gameMode === 'classic' ? (`${this.gamePhase === 'placing' ? this.piecesLeft[2] : this.piecesOnBoard[2]} ${this.gamePhase === 'placing' ? 'left' : 'on board'}`) : `${this.piecesLeft[2]} pieces left`;
        
        this.dom.player1.pieces.textContent = p1PiecesText;
        this.dom.player2.pieces.textContent = p2PiecesText;
        
        // <-- FIX: Disable reset button for the client in a network game
        const isClientInNetworkGame = this.settings.gameType === 'network' && this.settings.networkRole === 'client';
        this.dom.resetButton.disabled = isClientInNetworkGame;
        this.dom.resetButton.style.cursor = isClientInNetworkGame ? 'not-allowed' : 'pointer';
        this.dom.resetButton.style.opacity = isClientInNetworkGame ? '0.6' : '1';
    }

    endGame(winner) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.isRemovingPiece = false;
        this.showAIThinking(false);

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
    }
    
    reset(sendNetworkEvent = true) {
        if (window.ipcRenderer && this.settings.networkRole !== 'none') {
            const isLeavingNetworkMode = this.settings.gameType !== 'network';

            // <-- FIX: The host now correctly sends a reset command to the client.
            if (this.settings.networkRole === 'host' && sendNetworkEvent && !isLeavingNetworkMode) {
                window.ipcRenderer.send('send-network-event', { type: 'reset' });
            }
            
            if (isLeavingNetworkMode) {
                 window.ipcRenderer.send('stop-networking');
                 this.settings.networkRole = 'none';
            }
        }
        if (this.settings.gameType !== 'network') this.settings.networkRole = 'none';
        
        this.board.fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.gameOver = false;
        this.isAIThinking = false;
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        this.winningPositions = [];
        this.settings.isMyTurn = this.settings.networkRole !== 'client';
        this.isWaitingForConnection = false; 
        
        this.player2Name = "Opponent";
        
        if (this.settings.gameType === 'ai') this.ai = new AIPlayer(this.settings.difficulty);
        else this.ai = null;
        
        this.updatePhase();
        this.updateDisplay();
        this.renderBoard();
        this.showAIThinking(false);
    }
    
    launchConfetti() {
        this.dom.confettiContainer.innerHTML = '';
        for (let i = 0; i < 50; i++) {
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