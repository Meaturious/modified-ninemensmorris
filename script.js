// START OF FILE script.js
const AIPlayer = window.AIPlayer;

class NineMensMorrisGame {
    constructor() {
        // --- Core Game State ---
        this.board = Array(24).fill(null);
        this.currentPlayer = 1;
        this.gameOver = false;
        this.isAIThinking = false;

        // --- Default Settings ---
        this.settings = {
            difficulty: 'hard',
            gameType: 'ai',
            gameMode: 'classic',
            darkMode: true,
        };
        
        // ** NEW: Load saved settings from localStorage on startup **
        this.loadSettings();

        // --- Mode-Specific State ---
        this.gamePhase = 'placing';
        this.piecesLeft = { 1: 9, 2: 9 };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        this.winningPositions = [];
        
        this.availableDifficulties = ['easy', 'medium', 'hard', 'human'];
        this.availableGameModes = ['simple', 'classic'];

        this.ai = null;
        this.millPatterns = [[0,1,2],[2,3,4],[4,5,6],[6,7,0],[8,9,10],[10,11,12],[12,13,14],[14,15,8],[16,17,18],[18,19,20],[20,21,22],[22,23,16],[1,9,17],[3,11,19],[5,13,21],[7,15,23]];
        this.adjacencyMap = { 0:[1,7],1:[0,2,9],2:[1,3],3:[2,4,11],4:[3,5],5:[4,6,13],6:[5,7],7:[0,6,15],8:[9,15],9:[1,8,10,17],10:[9,11],11:[3,10,12,19],12:[11,13],13:[5,12,14,21],14:[13,15],15:[7,8,14,23],16:[17,23],17:[9,16,18],18:[17,19],19:[11,18,20],20:[19,21],21:[13,20,22],22:[21,23],23:[15,16,22] };

        this.dom = {
            player1: { name: document.getElementById('player1-name'), pieces: document.getElementById('player1-pieces') },
            player2: { panel: document.getElementById('player2-panel'), name: document.getElementById('player2-name'), pieces: document.getElementById('player2-pieces') },
            resetButton: document.getElementById('reset-button'),
            settingsButton: document.getElementById('settings-button'),
            boardSVG: document.getElementById('game-board-svg'),
            allHitboxes: document.querySelectorAll('#game-board-svg .hitbox'),
            allPieces: document.querySelectorAll('#game-board-svg .piece'),
            confettiContainer: document.getElementById('confetti-container'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings-button'),
            difficultySetting: document.getElementById('difficulty-setting'),
            gamemodeSetting: document.getElementById('gamemode-setting'),
            darkmodeSetting: document.getElementById('darkmode-setting'),
            difficultyValue: document.getElementById('difficulty-value'),
            gamemodeValue: document.getElementById('gamemode-value'),
            darkmodeValue: document.getElementById('darkmode-value'),
        };
    }
    
    // --- NEW: Settings Persistence ---
    saveSettings() {
        const settingsToSave = {
            gameMode: this.settings.gameMode,
            darkMode: this.settings.darkMode
        };
        localStorage.setItem('nineMensMorrisSettings', JSON.stringify(settingsToSave));
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('nineMensMorrisSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            // Merge saved settings into the defaults, ensuring no properties are missing
            this.settings.gameMode = parsedSettings.gameMode || 'classic';
            // Check for undefined explicitly to handle the case where it was saved as `false`
            this.settings.darkMode = parsedSettings.darkMode !== undefined ? parsedSettings.darkMode : true;
        }
    }
    
    applySettings() {
        document.body.classList.toggle('light-mode', !this.settings.darkMode);
        this.updateSettingsDisplay();
    }


    setupDOMListeners() {
        this.dom.boardSVG.addEventListener('click', (e) => {
            if (e.target.classList.contains('hitbox')) this.handlePositionClick(e.target);
        });
        this.dom.resetButton.addEventListener('click', () => this.reset());
        this.dom.settingsButton.addEventListener('click', () => this.toggleSettingsModal(true));
        this.dom.closeSettingsBtn.addEventListener('click', () => this.toggleSettingsModal(false));
        this.dom.difficultySetting.addEventListener('click', () => this.cycleDifficulty());
        this.dom.gamemodeSetting.addEventListener('click', () => this.cycleGameMode());
        this.dom.darkmodeSetting.addEventListener('click', () => this.toggleDarkMode());
    }

    // --- Settings Logic ---
    cycleDifficulty() {
        const currentIndex = this.availableDifficulties.indexOf(this.settings.gameType === 'human' ? 'human' : this.settings.difficulty);
        const nextIndex = (currentIndex + 1) % this.availableDifficulties.length;
        const newSelection = this.availableDifficulties[nextIndex];
        
        if (newSelection === 'human') {
            this.settings.gameType = 'human';
        } else {
            this.settings.gameType = 'ai';
            this.settings.difficulty = newSelection;
        }
        this.updateSettingsDisplay();
        this.reset();
    }
    
    cycleGameMode() {
        const currentIndex = this.availableGameModes.indexOf(this.settings.gameMode);
        this.settings.gameMode = this.availableGameModes[(currentIndex + 1) % this.availableGameModes.length];
        this.saveSettings(); // ** NEW: Save after changing **
        this.updateSettingsDisplay();
        this.reset();
    }
    
    toggleDarkMode() {
        this.settings.darkMode = !this.settings.darkMode;
        this.saveSettings(); // ** NEW: Save after changing **
        this.applySettings();
    }

    toggleSettingsModal(show) {
        this.dom.settingsModal.classList.toggle('hidden', !show);
        if (show) this.updateSettingsDisplay();
    }

    updateSettingsDisplay() {
        this.dom.difficultyValue.textContent = this.settings.gameType === 'human' ? 'vs. Human' : `${this.settings.difficulty.charAt(0).toUpperCase() + this.settings.difficulty.slice(1)} AI`;
        this.dom.gamemodeValue.textContent = this.settings.gameMode.charAt(0).toUpperCase() + this.settings.gameMode.slice(1);
        this.dom.darkmodeValue.textContent = this.settings.darkMode ? 'On' : 'Off';
    }
    
    // --- Core Game Flow ---
    handlePositionClick(target) {
        if (this.gameOver || this.isAIThinking || (this.settings.gameType === 'ai' && this.currentPlayer === 2)) return;
        const position = parseInt(target.dataset.position);

        if (this.settings.gameMode === 'simple') {
            if (this.gamePhase === 'placing' && this.board[position] === null) {
                this.makeMove({ to: position });
            }
            return;
        }

        if (this.isRemovingPiece) {
            this.handleRemovePiece(position);
        } else if (this.gamePhase === 'placing') {
            if (this.board[position] === null) this.makeMove({ to: position });
        } else {
            this.handleMovePiece(position);
        }
    }

    async makeMove(move) {
        const { from, to, remove } = move;
        if (to === null || to === -1 || this.board[to] !== null) return;

        // Apply the move
        this.board[to] = this.currentPlayer;
        if (from !== undefined && from !== null) {
            this.board[from] = null;
        } else {
            this.piecesLeft[this.currentPlayer]--;
            this.piecesOnBoard[this.currentPlayer]++;
        }
        
        this.updatePhase();
        this.renderBoard();
        
        const justMadeMill = this.isPositionInMill(to, this.currentPlayer);

        if (this.settings.gameMode === 'simple') {
            if (justMadeMill) {
                this.winningPositions = this.getMillPattern(to, this.currentPlayer);
                this.endGame(this.currentPlayer);
            } else if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) {
                this.endGame(null);
            } else {
                this.switchPlayer();
            }
        } else { // Classic Mode
            if (justMadeMill) {
                this.isRemovingPiece = true;
                this.updateDisplay();
                
                if (this.currentPlayer === 2 && this.settings.gameType === 'ai' && remove !== null) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    this.handleRemovePiece(remove);
                }
            } else {
                this.switchPlayer();
            }
        }
    }
    
    switchPlayer() {
        if (this.gameOver) return;
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        
        if (this.settings.gameMode === 'classic' && this.gamePhase !== 'placing') {
            if (!this.hasValidMoves(this.currentPlayer)) {
                this.endGame(this.currentPlayer === 1 ? 2 : 1);
                return;
            }
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
        
        if (aiMove && aiMove.to !== null && aiMove.to !== -1) {
            this.makeMove(aiMove); 
        }
    }

    // --- Classic Mode Logic ---
    handleMovePiece(position) {
        const canFly = this.piecesOnBoard[this.currentPlayer] === 3;
        if (this.selectedPiece === null) {
            if (this.board[position] === this.currentPlayer) {
                this.selectedPiece = position;
                this.renderBoard();
            }
        } else {
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
            this.board[position] = null;
            this.piecesOnBoard[opponent]--;
            this.isRemovingPiece = false;
            
            if (this.gamePhase !== 'placing' && this.piecesOnBoard[opponent] < 3) {
                this.endGame(this.currentPlayer);
                this.renderBoard();
                return; 
            }
            
            this.switchPlayer();
        }
    }
    
    // --- State & Utility Functions ---
    updatePhase() {
        if (this.piecesLeft[1] > 0 || this.piecesLeft[2] > 0) {
            this.gamePhase = 'placing';
        } else {
            this.gamePhase = 'moving';
        }
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
        if (this.gamePhase === 'placing') {
            return this.board.includes(null);
        }
        if (this.piecesOnBoard[player] === 3) {
            return this.board.includes(null);
        }
        const playerPieces = [...this.board.keys()].filter(i => this.board[i] === player);
        return playerPieces.some(pos => this.adjacencyMap[pos].some(adj => this.board[adj] === null));
    }
    
    // --- UI, Rendering, and Reset ---
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
        let p1NameText = this.settings.gameType === 'human' ? 'Player 1' : 'You';
        if (this.isRemovingPiece && this.currentPlayer === 1) {
            p1NameText = 'Remove a piece!';
        }
        if (!this.gameOver) {
            this.dom.player1.name.textContent = p1NameText;
        }
        const p1PiecesText = this.settings.gameMode === 'classic' ? (this.gamePhase === 'placing' ? `${this.piecesLeft[1]} pieces left` : `${this.piecesOnBoard[1]} on board`) : `${this.piecesLeft[1]} pieces left`;
        const p2PiecesText = this.settings.gameMode === 'classic' ? (this.gamePhase === 'placing' ? `${this.piecesLeft[2]} pieces left` : `${this.piecesOnBoard[2]} on board`) : `${this.piecesLeft[2]} pieces left`;
        this.dom.player1.pieces.textContent = p1PiecesText;
        this.dom.player2.pieces.textContent = p2PiecesText;
    }

    showAIThinking(show) {
        this.dom.player2.panel.classList.toggle('thinking', show);
    }

    endGame(winner) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.isRemovingPiece = false;
        this.showAIThinking(false);

        if (winner === 1) {
            this.dom.player1.name.textContent = 'You Win!';
            this.launchConfetti();
        } else if (winner === 2) {
            this.dom.player2.name.textContent = `${this.settings.gameType === 'human' ? 'Player 2' : 'AI'} Wins!`;
        } else {
            this.dom.player1.name.textContent = "It's a Draw!";
            this.dom.player2.name.textContent = "It's a Draw!";
        }
        this.renderBoard();
    }
    
    reset() {
        this.board.fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.piecesOnBoard = { 1: 0, 2: 0 };
        this.gameOver = false;
        this.winningPositions = [];
        this.isAIThinking = false;
        this.isRemovingPiece = false;
        this.selectedPiece = null;
        
        if (this.settings.gameType === 'ai') {
            this.ai = new AIPlayer(this.settings.difficulty);
            const diffName = this.settings.difficulty;
            this.dom.player1.name.textContent = 'You';
            this.dom.player2.name.textContent = `${diffName.charAt(0).toUpperCase() + diffName.slice(1)} AI`;
        } else {
            this.ai = null;
            this.dom.player1.name.textContent = 'Player 1';
            this.dom.player2.name.textContent = 'Player 2';
        }
        
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
    // ** NEW: Apply loaded settings right after the game is created **
    game.applySettings(); 
    game.setupDOMListeners();
    game.reset();
});