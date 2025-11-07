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
        this.gameMode = 'ai-medium';
        this.ai = null;
        
        this.millPatterns = [
            [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0], [8, 9, 10], [10, 11, 12], 
            [12, 13, 14], [14, 15, 8], [16, 17, 18], [18, 19, 20], [20, 21, 22], 
            [22, 23, 16], [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]
        ];
        
        // OPTIMIZATION: Remove confetti pre-allocation.
        this.confettiContainer = document.getElementById('confetti-container');
    }

    setupDOMListeners() {
        document.querySelector('.game-board').addEventListener('click', (e) => {
            if (e.target.classList.contains('board-position')) this.handlePositionClick(e.target);
        });
    }
    
    // OPTIMIZATION: The prepareConfetti method is no longer needed and has been removed.

    setGameMode(mode, isInitial = false) {
        this.gameMode = mode;
        if (mode !== 'human') {
            const difficulty = mode.replace('ai-', '');
            this.ai = new AIPlayer(difficulty);
            document.body.setAttribute('data-ai-mode', 'true');
        } else {
            this.ai = null;
            document.body.setAttribute('data-ai-mode', 'false');
        }
        
        this.updateModeButtons();
        if (!isInitial) this.reset();
    }

    updateModeButtons() {
        document.querySelectorAll('.mode-button').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.mode-button[data-mode='${this.gameMode}']`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    updatePlayerLabels() {
        const p1Name = document.getElementById('player1-name');
        const p2Name = document.getElementById('player2-name');
        if (this.gameMode === 'human') {
            p1Name.textContent = 'Player 1';
            p2Name.textContent = 'Player 2';
        } else {
            p1Name.textContent = 'Human';
            p2Name.textContent = 'AI';
        }
    }

    handlePositionClick(target) {
        if (this.gameOver || this.isAIThinking) return;
        if (this.gameMode !== 'human' && this.currentPlayer === 2) return;
        
        const position = parseInt(target.dataset.position);
        if (this.board[position] !== null) return;
        
        this.makeMove(position);
    }

    async makeMove(position) {
        if (this.gameOver) return;
        
        this.board[position] = this.currentPlayer;
        this.piecesLeft[this.currentPlayer]--;
        
        if (this.checkForMill(position, this.currentPlayer)) {
            this.renderBoard();
            this.endGame(`${this.getPlayerName(this.currentPlayer)} Wins!`);
            return;
        }
        
        if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) {
            this.renderBoard();
            this.endGame("It's a Draw!");
            return;
        }
        
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.renderBoard();
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
            this.endGame("It's a Draw!");
        }
    }

    showAIThinking(show) {
        document.getElementById('player2-panel').classList.toggle('thinking', show);
    }

    getPlayerName(player) {
        return document.getElementById(`player${player}-name`).textContent;
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
        document.querySelectorAll('.board-position').forEach((pos, index) => {
            pos.classList.remove('occupied', 'winning-position', 'player1', 'player2');
            if (this.board[index] !== null) {
                pos.classList.add('occupied', `player${this.board[index]}`);
            }
            if (this.gameOver && this.winningPositions.includes(index)) {
                pos.classList.add('winning-position');
            }
        });
    }

    updateDisplay() {
        document.getElementById('player1-pieces').textContent = `${this.piecesLeft[1]} pieces remaining`;
        document.getElementById('player2-pieces').textContent = `${this.piecesLeft[2]} pieces remaining`;
        
        const p1Panel = document.getElementById('player1-panel');
        const p2Panel = document.getElementById('player2-panel');
        
        if (!this.gameOver) {
            p1Panel.classList.toggle('active', this.currentPlayer === 1);
            p2Panel.classList.toggle('active', this.currentPlayer === 2);
        }
    }

    endGame(message) {
        this.gameOver = true;
        document.getElementById('game-over-message').textContent = message;
        document.getElementById('player1-panel').classList.remove('active');
        document.getElementById('player2-panel').classList.remove('active');
        
        if (message.includes('Wins!')) {
            this.launchConfetti();
        }
    }
    
    // OPTIMIZATION: This function now creates and destroys confetti on demand.
    launchConfetti() {
        const confettiCount = 50;
        const colors = ['#e67e22', '#3498db', '#9b59b6', '#f1c40f', '#e74c3c'];
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.animationDelay = Math.random() * 0.3 + 's';
            
            // This is the key to preventing the memory leak.
            // The element removes itself from the DOM when its animation is over.
            confetti.addEventListener('animationend', () => {
                confetti.remove();
            });

            this.confettiContainer.appendChild(confetti);
            // We must add the class *after* appending to ensure the animation triggers.
            setTimeout(() => confetti.classList.add('animate'), 10);
        }
    }

    reset() {
        this.board.fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.gameOver = false;
        this.winningPositions = [];
        this.isAIThinking = false;
        
        document.getElementById('game-over-message').textContent = '';
        this.showAIThinking(false);
        this.renderBoard();
        this.updatePlayerLabels();
        this.updateDisplay();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.AIPlayer) {
        console.error("AIPlayer class not found. Ensure ai.js is loaded correctly before script.js.");
        document.body.innerHTML = "<div style='color: white; font-family: sans-serif; padding: 30px;'><h1>Application Error</h1><p>A critical component (AIPlayer) failed to load. The application cannot start.</p></div>";
        return;
    }

    const game = new NineMensMorrisGame();

    game.setupDOMListeners();

    document.getElementById('reset-button').addEventListener('click', () => {
        game.reset();
    });

    document.querySelectorAll('.mode-button').forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            game.setGameMode(mode);
        });
    });

    const initialMode = document.querySelector('.mode-button.active').dataset.mode;
    game.setGameMode(initialMode, true);
    
    const updateNotification = document.getElementById('update-notification');
    const updateMessage = document.getElementById('update-message');
    const downloadButton = document.getElementById('download-button');
    const closeButton = document.getElementById('close-button');

    if (window.ipcRenderer) {
        window.ipcRenderer.on('update-info-available', (info) => {
          updateMessage.innerText = `Version ${info.version} is available!`;
          updateNotification.classList.remove('hidden');
        });

        downloadButton.addEventListener('click', () => {
          window.ipcRenderer.send('open-download-page');
        });

        closeButton.addEventListener('click', () => {
          updateNotification.classList.add('hidden');
        });
    }
});