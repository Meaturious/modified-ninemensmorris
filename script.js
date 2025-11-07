// Get the AIPlayer class from the ai.js script
const AIPlayer = window.AIPlayer;

class NineMensMorrisGame {
    constructor() {
        this.board = Array(24).fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.gameOver = false;
        this.winningPositions = [];
        this.isAIThinking = false;
        this.gameMode = 'ai-hard';
        this.ai = null;
        this.millPatterns = [[0,1,2],[2,3,4],[4,5,6],[6,7,0],[8,9,10],[10,11,12],[12,13,14],[14,15,8],[16,17,18],[18,19,20],[20,21,22],[22,23,16],[1,9,17],[3,11,19],[5,13,21],[7,15,23]];

        this.dom = {
            player1: { name: document.getElementById('player1-name'), pieces: document.getElementById('player1-pieces') },
            player2: { panel: document.getElementById('player2-panel'), name: document.getElementById('player2-name'), pieces: document.getElementById('player2-pieces') },
            resetButton: document.getElementById('reset-button'),
            settingsButton: document.getElementById('settings-button'),
            boardSVG: document.getElementById('game-board-svg'),
            allPieces: document.querySelectorAll('#game-board-svg .piece'), // Get all visual piece elements
            confettiContainer: document.getElementById('confetti-container'),
            // Modal elements
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings-button'),
            modeButtons: document.querySelectorAll('.mode-button')
        };
    }

    setupDOMListeners() {
        this.dom.boardSVG.addEventListener('click', (e) => {
            if (e.target.classList.contains('hitbox')) {
                this.handlePositionClick(e.target);
            }
        });
        this.dom.resetButton.addEventListener('click', () => this.reset());
        
        // Enable settings modal listeners
        this.dom.settingsButton.addEventListener('click', () => this.toggleSettingsModal(true));
        this.dom.closeSettingsBtn.addEventListener('click', () => this.toggleSettingsModal(false));
        this.dom.modeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setGameMode(e.target.dataset.mode);
                this.toggleSettingsModal(false);
            });
        });
    }

    toggleSettingsModal(show) {
        this.dom.settingsModal.classList.toggle('hidden', !show);
        if (show) {
            this.updateModeButtons();
        }
    }

    updateModeButtons() {
        this.dom.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.gameMode);
        });
    }

    setGameMode(mode) {
        this.gameMode = mode;
        this.ai = mode !== 'human' ? new AIPlayer(mode.replace('ai-', '')) : null;
        this.reset();
    }
    
    handlePositionClick(target) {
        if (this.gameOver || this.isAIThinking) return;
        if (this.gameMode !== 'human' && this.currentPlayer === 2) return; // Only player 1 can click vs AI
        const position = parseInt(target.dataset.position);
        if (this.board[position] !== null) return;
        this.makeMove(position);
    }

    async makeMove(position) {
        if (this.gameOver || this.board[position] !== null) return;

        this.board[position] = this.currentPlayer;
        this.piecesLeft[this.currentPlayer]--;
        this.renderBoard();

        if (this.checkForMill(position, this.currentPlayer)) {
            this.endGame(this.currentPlayer);
            return;
        }

        if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) {
            this.endGame(null); // Draw
            return;
        }

        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updateDisplay();

        if (this.gameMode !== 'human' && this.currentPlayer === 2 && !this.gameOver) {
            await this.makeAIMove();
        }
    }

    async makeAIMove() {
        if (!this.ai || this.gameOver) return;
        this.isAIThinking = true;
        this.showAIThinking(true);
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
        
        const aiMove = this.ai.makeMove(this);
        this.isAIThinking = false;
        this.showAIThinking(false);

        if (aiMove !== -1 && aiMove !== undefined) {
            this.makeMove(aiMove);
        } else {
            this.endGame(null); // Draw if AI has no moves
        }
    }

    checkForMill(position, player) {
        for (const pattern of this.millPatterns) {
            if (pattern.includes(position) && pattern.every(pos => this.board[pos] === player)) {
                this.winningPositions = pattern;
                return true;
            }
        }
        return false;
    }

    renderBoard() {
        this.dom.allPieces.forEach((piece, index) => {
            let classes = 'piece';
            if (this.board[index] !== null) {
                classes += ` occupied player${this.board[index]}`;
            }
            if (this.gameOver && this.winningPositions.includes(index)) {
                classes += ' winning-position';
            }
            piece.setAttribute('class', classes);
        });
    }

    updateDisplay() {
        this.dom.player1.pieces.textContent = `${this.piecesLeft[1]} pieces remaining`;
        this.dom.player2.pieces.textContent = `${this.piecesLeft[2]} pieces remaining`;
    }

    showAIThinking(show) {
        this.dom.player2.panel.classList.toggle('thinking', show);
    }

    endGame(winner) {
        this.gameOver = true;
        if (winner === 1) {
            this.dom.player1.name.textContent = 'You Win!';
            this.launchConfetti();
        } else if (winner === 2) {
            this.dom.player2.name.textContent = 'AI Wins!';
        } else {
            this.dom.player2.name.textContent = "It's a Draw!";
        }
    }

    reset() {
        this.board.fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.gameOver = false;
        this.winningPositions = [];
        this.isAIThinking = false;
        this.showAIThinking(false);
        
        // Update names based on game mode
        if (this.gameMode === 'human') {
            this.dom.player1.name.textContent = 'Player 1';
            this.dom.player2.name.textContent = 'Player 2';
        } else {
            const diffName = this.gameMode.replace('ai-', '');
            this.dom.player1.name.textContent = 'You';
            this.dom.player2.name.textContent = `${diffName.charAt(0).toUpperCase() + diffName.slice(1)} AI`;
        }
        
        this.updateDisplay();
        this.renderBoard();
    }

    launchConfetti() {
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
    if (!window.AIPlayer) {
        console.error("Critical Error: AIPlayer class not found.");
        return;
    }
    const game = new NineMensMorrisGame();
    game.setupDOMListeners();
    game.setGameMode('ai-hard');
});