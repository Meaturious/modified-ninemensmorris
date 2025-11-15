// AI Worker - Runs minimax algorithm in parallel
// This worker runs in a separate thread for multi-core processing

const AI_PLAYER = 2;
const HUMAN_PLAYER = 1;
const MINIMAX_WIN_SCORE = 100000;
const MINIMAX_LOSS_SCORE = -100000;
const MINIMAX_DRAW_SCORE = 0;
const MILL_SCORE = 10000;
const SETUP_SCORE = 500;
const DOUBLE_SETUP_SCORE = 200;
const STRATEGIC_POSITION_SCORE = 15;

// Listen for messages from main thread
self.onmessage = function(e) {
    try {
        if (!e || !e.data) {
            console.error('Worker received invalid message:', e);
            return;
        }
        
        const { type, gameState, depth, alpha, beta, isMaximizing, workerId, move } = e.data;
        
        if (type === 'search') {
            // Validate input
            if (!gameState || !gameState.board || !gameState.millPatterns) {
                console.error('Worker received invalid gameState:', gameState);
                self.postMessage({
                    type: 'result',
                    result: { move: null, score: 0 },
                    move: move,
                    workerId: workerId
                });
                return;
            }
            
            // Deep clone game state to avoid mutations
            const clonedGame = {
                board: [...gameState.board],
                millPatterns: gameState.millPatterns
            };
            
            const result = minimaxSimple(clonedGame, depth, alpha, beta, isMaximizing, 0);
            
            // Send result back to main thread with the move that was evaluated
            self.postMessage({
                type: 'result',
                result: result,
                move: move, // Include the move being evaluated
                workerId: workerId
            });
        } else if (type === 'ping') {
            // Respond to ping to verify worker is alive
            self.postMessage({
                type: 'pong',
                workerId: workerId
            });
        }
    } catch (error) {
        console.error('Worker error processing message:', error);
        // Send error response
        if (e && e.data) {
            self.postMessage({
                type: 'result',
                result: { move: null, score: -Infinity },
                move: e.data.move,
                workerId: e.data.workerId,
                error: error.message
            });
        }
    }
};

// Handle errors
self.onerror = function(error) {
    console.error('Worker error:', error);
};

function minimaxSimple(game, depth, alpha, beta, isMaximizing, ply) {
    if (!game || !game.board) {
        return { move: null, score: MINIMAX_DRAW_SCORE };
    }
    
    const winner = checkSimpleWinner(game);
    if (winner !== null) {
        const depthBonus = depth * 1000;
        return { move: null, score: winner === AI_PLAYER ? (MINIMAX_WIN_SCORE + depthBonus) : (MINIMAX_LOSS_SCORE - depthBonus) };
    }
    
    if (depth === 0) {
        return { move: null, score: evaluateSimplePosition(game) };
    }
    
    const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
    if (emptyPositions.length === 0) return { move: null, score: MINIMAX_DRAW_SCORE };
    
    const orderedMoves = orderSimpleMoves(game, emptyPositions, isMaximizing);
    let bestMove = -1;
    
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of orderedMoves) {
            game.board[move] = AI_PLAYER;
            let evalScore = minimaxSimple(game, depth - 1, alpha, beta, false, ply + 1).score;
            game.board[move] = null;
            if (evalScore > maxEval) { maxEval = evalScore; bestMove = move; }
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return { move: bestMove, score: maxEval };
    } else {
        let minEval = Infinity;
        for (const move of orderedMoves) {
            game.board[move] = HUMAN_PLAYER;
            let evalScore = minimaxSimple(game, depth - 1, alpha, beta, true, ply + 1).score;
            game.board[move] = null;
            if (evalScore < minEval) { minEval = evalScore; bestMove = move; }
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return { move: bestMove, score: minEval };
    }
}

function checkSimpleWinner(game) {
    for (const pattern of game.millPatterns) {
        const p1 = game.board[pattern[0]];
        if (p1 !== null && p1 === game.board[pattern[1]] && p1 === game.board[pattern[2]]) {
            return p1;
        }
    }
    return null;
}

function evaluateSimplePosition(game) {
    let score = 0;
    let aiSetupCount = 0;
    let humanSetupCount = 0;
    
    for (const pattern of game.millPatterns) {
        const pieces = pattern.map(p => game.board[p]);
        const aiPieces = pieces.filter(p => p === AI_PLAYER).length;
        const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
        const empty = pieces.filter(p => p === null).length;
        
        if (aiPieces === 2 && empty === 1) {
            score += SETUP_SCORE;
            aiSetupCount++;
        }
        if (aiPieces === 1 && empty === 2) {
            score += SETUP_SCORE / 3;
        }
        
        if (humanPieces === 2 && empty === 1) {
            score -= SETUP_SCORE;
            humanSetupCount++;
        }
        if (humanPieces === 1 && empty === 2) {
            score -= SETUP_SCORE / 3;
        }
    }
    
    const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
    for (const pos of emptyPositions) {
        let aiPatterns = 0;
        let humanPatterns = 0;
        
        for (const pattern of game.millPatterns) {
            if (pattern.includes(pos)) {
                const pieces = pattern.map(p => game.board[p]);
                const aiPieces = pieces.filter(p => p === AI_PLAYER).length;
                const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
                const empty = pieces.filter(p => p === null).length;
                
                if (aiPieces === 2 && empty === 1) aiPatterns++;
                if (humanPieces === 2 && empty === 1) humanPatterns++;
            }
        }
        
        if (aiPatterns >= 2) {
            score += DOUBLE_SETUP_SCORE * aiPatterns;
        }
        if (humanPatterns >= 2) {
            score -= DOUBLE_SETUP_SCORE * humanPatterns;
        }
    }
    
    const aiPiecesOnBoard = game.board.filter(p => p === AI_PLAYER).length;
    const humanPiecesOnBoard = game.board.filter(p => p === HUMAN_PLAYER).length;
    score += (aiPiecesOnBoard - humanPiecesOnBoard) * 5;
    
    const strategicPositions = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
    for (const pos of strategicPositions) {
        if (game.board[pos] === AI_PLAYER) score += STRATEGIC_POSITION_SCORE;
        if (game.board[pos] === HUMAN_PLAYER) score -= STRATEGIC_POSITION_SCORE;
    }
    
    if (aiSetupCount > humanSetupCount) {
        score += (aiSetupCount - humanSetupCount) * 50;
    }
    if (humanSetupCount > aiSetupCount) {
        score -= (humanSetupCount - aiSetupCount) * 50;
    }
    
    return score;
}

function orderSimpleMoves(game, moves, isMaximizing) {
    const player = isMaximizing ? AI_PLAYER : HUMAN_PLAYER;
    const opponent = isMaximizing ? HUMAN_PLAYER : AI_PLAYER;
    
    return moves.sort((a, b) => {
        const tempBoardA = [...game.board];
        const tempBoardB = [...game.board];
        tempBoardA[a] = player;
        tempBoardB[b] = player;
        const createsMillA = checkSimpleWinner({ board: tempBoardA, millPatterns: game.millPatterns }) === player;
        const createsMillB = checkSimpleWinner({ board: tempBoardB, millPatterns: game.millPatterns }) === player;
        if (createsMillA && !createsMillB) return -1;
        if (!createsMillA && createsMillB) return 1;
        
        const blocksA = blocksOpponentMill(a, opponent, game);
        const blocksB = blocksOpponentMill(b, opponent, game);
        if (blocksA && !blocksB) return -1;
        if (!blocksA && blocksB) return 1;
        return 0;
    });
}

function blocksOpponentMill(position, opponent, game) {
    for (const pattern of game.millPatterns) {
        if (pattern.includes(position)) {
            const pieces = pattern.map(p => game.board[p]);
            if (pieces.filter(p => p === opponent).length === 2 && pieces.includes(null)) {
                return true;
            }
        }
    }
    return false;
}

