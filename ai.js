/**
 * AI Player with different difficulty levels
 */
window.AIPlayer = class AIPlayer {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.player = 2; // AI is always player 2
    }

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

    // --- EASY AND MEDIUM AI LOGIC (Unchanged) ---

    makeRandomMove(game) {
        const emptyPositions = game.board.map((p, i) => p === null ? i : null).filter(p => p !== null);
        if (emptyPositions.length === 0) return -1;
        return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    }

    makeMediumMove(game) {
        const moves = [
            this.findWinningMove(game, this.player), // 1. Win
            this.findWinningMove(game, 1),           // 2. Block win
            this.findSetupMove(game, this.player),   // 3. Setup mill
            this.getStrategicMove(game),             // 4. Strategic move
            this.makeRandomMove(game)                // 5. Fallback
        ];
        return moves.find(move => move !== -1 && move !== undefined);
    }
    
    getStrategicMove(game) {
        const centerPositions = [9, 11, 13, 15, 17, 19, 21, 23];
        const availableCenters = centerPositions.filter(pos => game.board[pos] === null);
        if (availableCenters.length > 0) {
            return availableCenters[Math.floor(Math.random() * availableCenters.length)];
        }
        return -1;
    }

    findWinningMove(game, player) {
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(pos => game.board[pos]);
            if (pieces.filter(p => p === player).length === 2 && pieces.includes(null)) {
                return pattern[pieces.indexOf(null)];
            }
        }
        return -1;
    }

    findSetupMove(game, player) {
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(pos => game.board[pos]);
            if (pieces.filter(p => p === player).length === 1 && pieces.filter(p => p === null).length === 2) {
                const emptyIndex = pieces.indexOf(null);
                return pattern[emptyIndex];
            }
        }
        return -1;
    }

    // --- HARD AI - MINIMAX ALGORITHM ---

    makeHardMove(game) {
        const winningMove = this.findWinningMove(game, this.player);
        if (winningMove !== -1) {
            return winningMove;
        }

        const opponent = 1;
        const blockingMove = this.findWinningMove(game, opponent);
        if (blockingMove !== -1) {
            return blockingMove;
        }
        
        const depth = 4; 
        // We create one clone here to pass to the simulation, so the main game state is untouched.
        const simulationGame = this.cloneGame(game);
        const bestMoveResult = this.findBestMoveMinimax(simulationGame, depth);

        return bestMoveResult.move !== -1 ? bestMoveResult.move : this.makeRandomMove(game);
    }

    findBestMoveMinimax(game, depth) {
        let bestScore = -Infinity;
        let bestMove = -1;
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);

        for (const move of emptyPositions) {
            // OPTIMIZATION: Mutate the board, evaluate, then undo the move. No cloning in the loop.
            game.board[move] = this.player;
            const score = this.minimax(game, depth - 1, -Infinity, Infinity, false);
            game.board[move] = null; // Undo the move

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        
        return { move: bestMove, score: bestScore };
    }

    minimax(game, depth, alpha, beta, isMaximizing) {
        const score = this.evaluateBoard(game);
        
        if (Math.abs(score) > 5000 || depth === 0) {
            return score;
        }

        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        if (emptyPositions.length === 0) return 0;

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of emptyPositions) {
                // OPTIMIZATION: Make move on the board directly.
                game.board[move] = this.player;
                const evaluationResult = this.minimax(game, depth - 1, alpha, beta, false);
                // OPTIMIZATION: Undo the move to revert state for the next iteration.
                game.board[move] = null;
                
                maxEval = Math.max(maxEval, evaluationResult);
                alpha = Math.max(alpha, evaluationResult);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of emptyPositions) {
                // OPTIMIZATION: Make move for the opponent.
                game.board[move] = 1;
                const evaluationResult = this.minimax(game, depth - 1, alpha, beta, true);
                // OPTIMIZATION: Undo the move.
                game.board[move] = null;

                minEval = Math.min(minEval, evaluationResult);
                beta = Math.min(beta, evaluationResult);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }
    
    evaluateBoard(game) {
        let score = 0;
        const opponent = 1;

        for (const pattern of game.millPatterns) {
            if (pattern.every(pos => game.board[pos] === this.player)) return 10000;
            if (pattern.every(pos => game.board[pos] === opponent)) return -10000;
        }

        score += this.countThreats(game, this.player) * 100;
        score -= this.countThreats(game, opponent) * 120;

        score += this.positionalScore(game, this.player);
        score -= this.positionalScore(game, opponent);

        return score;
    }

    countThreats(game, player) {
        let threats = 0;
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(pos => game.board[pos]);
            if (pieces.filter(p => p === player).length === 2 && pieces.includes(null)) {
                threats++;
            }
        }
        return threats;
    }
    
    positionalScore(game, player) {
        let score = 0;
        const opponent = player === 1 ? 2 : 1;
        for (const pattern of game.millPatterns) {
            if (!pattern.some(p => game.board[p] === opponent)) {
                score += pattern.filter(p => game.board[p] === player).length;
            }
        }
        return score;
    }

    cloneGame(game) {
        return {
            board: [...game.board],
            millPatterns: game.millPatterns
        };
    }
}