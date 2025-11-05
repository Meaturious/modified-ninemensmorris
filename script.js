/**
 * AI Player with different difficulty levels
 */
class AIPlayer {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.player = 2; // AI is always player 2 (blue)
    }

    /**
     * Make AI move based on difficulty level
     * @param {NineMensMorrisGame} game - Current game instance
     * @returns {number} - Position to place piece
     */
    makeMove(game) {
        switch (this.difficulty) {
            case 'easy':
                return this.makeRandomMove(game);
            case 'medium':
                return this.makeMediumMove(game);
            case 'hard':
                return this.makeHardMove(game);
            default:
                return this.makeMediumMove(game);
        }
    }

    /**
     * Easy AI - completely random moves
     */
    makeRandomMove(game) {
        const emptyPositions = game.board
            .map((pos, index) => pos === null ? index : null)
            .filter(pos => pos !== null);
        
        return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    }

    /**
     * Medium AI - blocks opponent mills and tries to form own mills
     */
    makeMediumMove(game) {
        // 1. Try to complete a mill (win)
        const winMove = this.findWinningMove(game, this.player);
        if (winMove !== -1) return winMove;

        // 2. Block opponent from winning
        const blockMove = this.findWinningMove(game, 1); // Player 1 is human
        if (blockMove !== -1) return blockMove;

        // 3. Try to set up a mill (get 2 in a row)
        const setupMove = this.findSetupMove(game, this.player);
        if (setupMove !== -1) return setupMove;

        // 4. Take center positions if available (strategic advantage)
        const centerPositions = [9, 11, 13, 15, 17, 19, 21, 23];
        const availableCenters = centerPositions.filter(pos => game.board[pos] === null);
        if (availableCenters.length > 0) {
            return availableCenters[Math.floor(Math.random() * availableCenters.length)];
        }

        // 5. Random move as fallback
        return this.makeRandomMove(game);
    }

    /**
     * Hard AI - advanced strategy with deeper analysis
     */
    makeHardMove(game) {
        // 1. Try to complete a mill (win)
        const winMove = this.findWinningMove(game, this.player);
        if (winMove !== -1) return winMove;

        // 2. Block opponent from winning
        const blockMove = this.findWinningMove(game, 1);
        if (blockMove !== -1) return blockMove;

        // 3. Look for double mill opportunities (setting up two potential mills)
        const doubleMill = this.findDoubleMill(game, this.player);
        if (doubleMill !== -1) return doubleMill;

        // 4. Block opponent's double mill setups
        const blockDoubleMill = this.findDoubleMill(game, 1);
        if (blockDoubleMill !== -1) return blockDoubleMill;

        // 5. Try to set up a mill
        const setupMove = this.findSetupMove(game, this.player);
        if (setupMove !== -1) return setupMove;

        // 6. Use positional evaluation to pick best strategic position
        return this.getBestPositionalMove(game);
    }

    /**
     * Find a move that completes a mill for the given player
     */
    findWinningMove(game, player) {
        for (let pattern of game.millPatterns) {
            const playerCount = pattern.filter(pos => game.board[pos] === player).length;
            const emptyCount = pattern.filter(pos => game.board[pos] === null).length;
            
            // If player has 2 pieces and 1 empty position, complete the mill
            if (playerCount === 2 && emptyCount === 1) {
                const emptyPos = pattern.find(pos => game.board[pos] === null);
                return emptyPos;
            }
        }
        return -1;
    }

    /**
     * Find a move that sets up a mill (gets 2 in a row with empty third)
     */
    findSetupMove(game, player) {
        for (let pattern of game.millPatterns) {
            const playerCount = pattern.filter(pos => game.board[pos] === player).length;
            const emptyCount = pattern.filter(pos => game.board[pos] === null).length;
            const opponentCount = pattern.filter(pos => game.board[pos] !== null && game.board[pos] !== player).length;
            
            // If player has 1 piece, no opponent pieces, and 2 empty spots
            if (playerCount === 1 && opponentCount === 0 && emptyCount === 2) {
                const emptyPositions = pattern.filter(pos => game.board[pos] === null);
                return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
            }
        }
        return -1;
    }

    /**
     * Find a move that creates a double mill opportunity (hard AI only)
     */
    findDoubleMill(game, player) {
        const emptyPositions = game.board
            .map((pos, index) => pos === null ? index : null)
            .filter(pos => pos !== null);

        for (let pos of emptyPositions) {
            let millCount = 0;
            
            // Count how many potential mills this position could complete
            for (let pattern of game.millPatterns) {
                if (pattern.includes(pos)) {
                    const otherPositions = pattern.filter(p => p !== pos);
                    const playerCount = otherPositions.filter(p => game.board[p] === player).length;
                    const emptyCount = otherPositions.filter(p => game.board[p] === null).length;
                    const opponentCount = otherPositions.filter(p => game.board[p] !== null && game.board[p] !== player).length;
                    
                    // This could lead to a mill if we have 1 piece and 1 empty, or 0 pieces and 2 empty
                    if (opponentCount === 0 && ((playerCount === 1 && emptyCount === 1) || (playerCount === 0 && emptyCount === 2))) {
                        millCount++;
                    }
                }
            }
            
            // If this position can set up multiple mills, it's a double mill opportunity
            if (millCount >= 2) {
                return pos;
            }
        }
        return -1;
    }

    /**
     * Get best positional move using strategic evaluation
     */
    getBestPositionalMove(game) {
        const emptyPositions = game.board
            .map((pos, index) => pos === null ? index : null)
            .filter(pos => pos !== null);

        if (emptyPositions.length === 0) return -1;

        let bestScore = -1000;
        let bestMove = emptyPositions[0];

        for (let pos of emptyPositions) {
            let score = this.evaluatePosition(game, pos, this.player);
            if (score > bestScore) {
                bestScore = score;
                bestMove = pos;
            }
        }

        return bestMove;
    }

    /**
     * Evaluate the strategic value of a position
     */
    evaluatePosition(game, position, player) {
        let score = 0;

        // Count potential mills this position is part of
        let potentialMills = 0;
        for (let pattern of game.millPatterns) {
            if (pattern.includes(position)) {
                const otherPositions = pattern.filter(p => p !== position);
                const opponentCount = otherPositions.filter(p => game.board[p] !== null && game.board[p] !== player).length;
                
                // Only count mills that aren't blocked by opponent
                if (opponentCount === 0) {
                    potentialMills++;
                }
            }
        }
        score += potentialMills * 10;

        // Prefer center positions for strategic advantage
        const centerPositions = [9, 11, 13, 15, 17, 19, 21, 23];
        if (centerPositions.includes(position)) {
            score += 5;
        }

        // Prefer corner positions for defensive play
        const cornerPositions = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
        if (cornerPositions.includes(position)) {
            score += 3;
        }

        return score;
    }
}

/**
 * Nine Men's Morris Game Class with AI Support
 */
class NineMensMorrisGame {
    constructor() {
        // Game state variables
        this.board = Array(24).fill(null);
        this.currentPlayer = 1; // 1 = human, 2 = AI
        this.piecesLeft = { 1: 9, 2: 9 };
        this.gameOver = false;
        this.winningPositions = [];
        this.gameMode = 'human'; // 'human', 'ai-easy', 'ai-medium', 'ai-hard'
        this.ai = null;
        this.isAIThinking = false;
        
        // All possible mill patterns
        this.millPatterns = [
            [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
            [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
            [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
            [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]
        ];
        
        this.initializeGame();
    }

    initializeGame() {
        const positions = document.querySelectorAll('.board-position');
        positions.forEach(position => {
            position.addEventListener('click', (e) => this.handlePositionClick(e));
        });
        this.updateDisplay();
    }

    setGameMode(mode) {
        this.gameMode = mode;
        
        if (mode !== 'human') {
            const difficulty = mode.replace('ai-', '');
            this.ai = new AIPlayer(difficulty);
            document.body.setAttribute('data-ai-mode', 'true');
        } else {
            this.ai = null;
            document.body.setAttribute('data-ai-mode', 'false');
        }
        
        this.reset();
        this.updateModeButtons();
        this.updatePlayerLabels();
    }

    updateModeButtons() {
        const buttons = document.querySelectorAll('.mode-button');
        buttons.forEach(btn => btn.classList.remove('active'));
        
        const modeMap = {
            'human': 0,
            'ai-easy': 1,
            'ai-medium': 2,
            'ai-hard': 3
        };
        
        if (buttons[modeMap[this.gameMode]]) {
            buttons[modeMap[this.gameMode]].classList.add('active');
        }
    }

    updatePlayerLabels() {
        const player1Indicator = document.querySelector('.player-info .player-indicator');
        const player2Indicator = document.querySelectorAll('.player-info .player-indicator')[1];
        
        if (this.gameMode === 'human') {
            player1Indicator.textContent = 'P1';
            player2Indicator.textContent = 'P2';
        } else {
            player1Indicator.textContent = 'H';
            player2Indicator.textContent = 'AI';
        }
    }

    async handlePositionClick(event) {
        if (this.gameOver || this.isAIThinking) return;
        
        // In AI mode, only allow human moves on player 1's turn
        if (this.gameMode !== 'human' && this.currentPlayer === 2) return;
        
        const position = parseInt(event.target.dataset.position);
        if (this.board[position] !== null) return;
        
        await this.makeMove(position);
    }

    async makeMove(position) {
        // Place piece
        this.board[position] = this.currentPlayer;
        this.piecesLeft[this.currentPlayer]--;
        this.renderBoard();
        
        // Check for mill
        if (this.checkForMill(position, this.currentPlayer)) {
            const playerName = this.getPlayerName(this.currentPlayer);
            this.endGame(`${playerName} Wins!`);
            return;
        }
        
        // Check for draw
        if (this.piecesLeft[1] === 0 && this.piecesLeft[2] === 0) {
            this.endGame("It's a Draw!");
            return;
        }
        
        // Switch players
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updateDisplay();
        
        // If it's AI's turn, make AI move
        if (this.gameMode !== 'human' && this.currentPlayer === 2 && !this.gameOver) {
            await this.makeAIMove();
        }
    }

    async makeAIMove() {
        if (!this.ai || this.gameOver) return;
        
        this.isAIThinking = true;
        this.showAIThinking(true);
        
        // Add delay for better UX
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
        
        const aiMove = this.ai.makeMove(this);
        if (aiMove !== undefined && aiMove !== -1) {
            await this.makeMove(aiMove);
        }
        
        this.isAIThinking = false;
        this.showAIThinking(false);
    }

    showAIThinking(show) {
        const thinkingElement = document.getElementById('ai-thinking');
        if (show) {
            thinkingElement.classList.add('show');
        } else {
            thinkingElement.classList.remove('show');
        }
    }

    getPlayerName(player) {
        if (this.gameMode === 'human') {
            return player === 1 ? 'Red' : 'Blue';
        } else {
            return player === 1 ? 'Human' : 'AI';
        }
    }

    checkForMill(position, player) {
        for (let pattern of this.millPatterns) {
            if (pattern.includes(position)) {
                if (pattern.every(pos => this.board[pos] === player)) {
                    this.winningPositions = pattern;
                    return true;
                }
            }
        }
        return false;
    }

    renderBoard() {
        const positions = document.querySelectorAll('.board-position');
        
        positions.forEach((position, index) => {
            position.classList.remove('occupied', 'winning-position', 'player1', 'player2');
            
            if (this.board[index] !== null) {
                position.classList.add('occupied', `player${this.board[index]}`);
            }
            
            if (this.gameOver && this.winningPositions.includes(index)) {
                position.classList.add('winning-position');
            }
        });
    }

    updateDisplay() {
        document.getElementById('player1-pieces').textContent = `${this.piecesLeft[1]} pieces`;
        document.getElementById('player2-pieces').textContent = `${this.piecesLeft[2]} pieces`;
        
        document.body.setAttribute('data-current-player', this.currentPlayer);
        
        const turnElement = document.getElementById('current-turn');
        const gameInfoElement = document.querySelector('.game-info');
        
        if (this.currentPlayer === 1) {
            const turnText = this.gameMode === 'human' ? "Red's Turn" : "Your Turn";
            turnElement.textContent = turnText;
            gameInfoElement.className = 'game-info player1-turn';
        } else {
            const turnText = this.gameMode === 'human' ? "Blue's Turn" : "AI's Turn";
            turnElement.textContent = turnText;
            gameInfoElement.className = 'game-info player2-turn';
        }
    }

    endGame(message) {
        this.gameOver = true;
        
        const turnElement = document.getElementById('current-turn');
        const gameInfoElement = document.querySelector('.game-info');
        
        turnElement.textContent = message;
        gameInfoElement.className = 'game-info game-over';
        
        const playerInfos = document.querySelectorAll('.player-info');
        playerInfos.forEach(info => info.classList.add('hidden'));
        
        this.renderBoard();
        
        if (message.includes('Wins!')) {
            this.launchConfetti();
        }
        
        this.showAIThinking(false);
    }

    launchConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe'];
        const confettiCount = 50;
        
        for (let i = 0; i < confettiCount; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.top = '-20px';
                confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.animationDelay = Math.random() * 0.3 + 's';
                confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
                document.body.appendChild(confetti);
                
                setTimeout(() => {
                    if (confetti.parentNode) {
                        confetti.parentNode.removeChild(confetti);
                    }
                }, 5000);
            }, Math.random() * 500);
        }
    }

    reset() {
        this.board = Array(24).fill(null);
        this.currentPlayer = 1;
        this.piecesLeft = { 1: 9, 2: 9 };
        this.gameOver = false;
        this.winningPositions = [];
        this.isAIThinking = false;
        
        const gameInfoElement = document.querySelector('.game-info');
        gameInfoElement.className = 'game-info player1-turn';
        
        const playerInfos = document.querySelectorAll('.player-info');
        playerInfos.forEach(info => info.classList.remove('hidden'));
        
        this.showAIThinking(false);
        this.renderBoard();
        this.updateDisplay();
    }
}

// Global game instance
let game;

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    game = new NineMensMorrisGame();
});

// Global functions for UI interaction
function resetGame() {
    if (game) {
        game.reset();
    }
}

function setGameMode(mode) {
    if (game) {
        game.setGameMode(mode);
    }
}