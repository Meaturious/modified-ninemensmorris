// START OF FINAL AI.JS
// AI Constants
const AI_PLAYER = 2; // AI is always player 2
const HUMAN_PLAYER = 1;
const MINIMAX_DEPTH_SIMPLE = 200; // ABSOLUTE MAXIMUM depth for multi-core simple mode
const MINIMAX_DEPTH_CLASSIC = 30; // Deep search for classic mode
const MAX_SEARCH_TIME_MS = 12000; // Maximum time for AI move (12 seconds)
const MAX_SEARCH_TIME_MS_EXTREME = 60000; // ABSOLUTE MAXIMUM time for extreme difficulty (60 seconds!!!)
const QUIESCENCE_DEPTH = 20; // Continue searching tactical positions to absolute maximum
const MAX_WORKERS = navigator.hardwareConcurrency || 4; // Use all available CPU cores
const MIN_MOVES_PER_WORKER = 1; // Reduced threshold for more aggressive parallelization
const MINIMAX_WIN_SCORE = 1000000; // Increased for better depth bonuses
const MINIMAX_LOSS_SCORE = -1000000;
const MINIMAX_DRAW_SCORE = 0;
const MIN_PIECES_FOR_FLYING = 3;
const MILL_SCORE = 200000; // ABSOLUTE MAXIMUM - 20x original
const SETUP_SCORE = 15000; // ABSOLUTE MAXIMUM - 30x original
const DOUBLE_SETUP_SCORE = 10000; // ABSOLUTE MAXIMUM - 50x original
const MOBILITY_SCORE = 200; // ABSOLUTE MAXIMUM - 20x original
const STRATEGIC_POSITION_SCORE = 300; // ABSOLUTE MAXIMUM - 20x original
const THREAT_SCORE = 2000; // ABSOLUTE MAXIMUM - immediate threat bonus
const PATTERN_CONTROL_SCORE = 500; // ABSOLUTE MAXIMUM - Increased
const TEMPO_SCORE = 200; // ABSOLUTE MAXIMUM - tempo bonus
const ENDGAME_PIECE_BONUS = 1000; // ABSOLUTE MAXIMUM - endgame piece advantage

window.AIPlayer = class AIPlayer {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.player = AI_PLAYER; // AI is always player 2
        this.transpositionTable = new Map(); // Transposition table for memoization
        this.nodesEvaluated = 0; // Performance tracking
        this.searchTimeout = null;
        this.searchStartTime = 0;
        this.workerPool = null;
        this.initializeWorkerPool();
    }

    initializeWorkerPool() {
        // Create Web Workers for parallel processing across multiple CPU cores
        if (typeof Worker !== 'undefined') {
            try {
                this.workerPool = [];
                this.workerCount = Math.min(MAX_WORKERS, 8); // Cap at 8 workers to avoid overhead
                this.useWorkers = true;
                
                // Create worker pool
                for (let i = 0; i < this.workerCount; i++) {
                    try {
                        const worker = new Worker('ai-worker.js');
                        worker.id = i;
                        worker.busy = false;
                        worker.ready = false;
                        
                        // Test worker with a ping message
                        const pingHandler = (e) => {
                            if (e.data && e.data.type === 'pong' && e.data.workerId === i) {
                                worker.ready = true;
                                worker.removeEventListener('message', pingHandler);
                                console.log(`Worker ${i} is ready`);
                            }
                        };
                        worker.addEventListener('message', pingHandler);
                        
                        // Send ping to test worker
                        setTimeout(() => {
                            try {
                                worker.postMessage({ type: 'ping', workerId: i });
                            } catch (e) {
                                console.warn(`Failed to ping worker ${i}:`, e);
                            }
                        }, 100);
                        
                        // Add error handler to detect worker failures
                        worker.addEventListener('error', (e) => {
                            console.error(`Worker ${i} error:`, e);
                            worker.ready = false;
                        });
                        
                        this.workerPool.push(worker);
                        console.log(`Worker ${i} created (testing...)`);
                    } catch (e) {
                        console.warn('Failed to create worker', i, e);
                    }
                }
                
                if (this.workerPool.length === 0) {
                    console.warn('No workers were created, falling back to single-threaded mode');
                    this.useWorkers = false;
                } else {
                    console.log(`Successfully initialized ${this.workerPool.length} workers`);
                }
            } catch (e) {
                console.warn('Worker initialization failed:', e);
                this.useWorkers = false;
            }
        } else {
            console.warn('Web Workers not supported, using single-threaded mode');
            this.useWorkers = false;
        }
    }

    terminateWorkers() {
        if (this.workerPool) {
            this.workerPool.forEach(worker => {
                if (worker.terminate) {
                    worker.terminate();
                }
            });
            this.workerPool = [];
        }
    }

    async makeMove(game) {
        try {
            if (!game || !game.board) {
                console.error('Invalid game state passed to AI');
                return { to: null, from: null, remove: null };
            }
            if (game.settings.gameMode === 'simple') {
                const position = await this.runSimpleLogicAsync(game);
                // Validate position is valid (not -1 or null)
                if (position === -1 || position === null || position === undefined || position < 0 || position >= 24) {
                    console.warn('AI returned invalid position:', position, 'using random move');
                    const fallback = this.makeRandomMove(game);
                    return { to: fallback !== -1 ? fallback : 0 };
                }
                return { to: position };
            } else {
                return this.runClassicLogic(game);
            }
        } catch (error) {
            console.error('Error in AI makeMove:', error);
            // Fallback to random move on error
            const fallback = this.makeRandomMove(game);
            return { to: fallback !== -1 ? fallback : 0, from: null, remove: null };
        }
    }


    async runSimpleLogicAsync(game) {
        try {
            if (this.difficulty === 'extreme') {
                return await this.runExtremeSimpleLogicAsync(game);
            } else if (this.difficulty === 'hard') {
                return await this.runHardSimpleLogicAsync(game);
            } else {
                // For easy/medium, use sync version (it's fast enough)
                const result = this.runSimpleLogicSync(game);
                // Ensure we return a valid move
                if (result === -1 || result === null || result === undefined) {
                    return this.makeRandomMove(game);
                }
                return result;
            }
        } catch (error) {
            console.error('Error in runSimpleLogicAsync:', error);
            // Fallback to random move
            return this.makeRandomMove(game);
        }
    }

    async runExtremeSimpleLogicAsync(game) {
        // Extreme difficulty uses multi-core parallel processing with adaptive worker allocation
        this.transpositionTable.clear();
        this.nodesEvaluated = 0;
        this.searchStartTime = performance.now();
        
        const simulationGame = { board: [...game.board], millPatterns: game.millPatterns };
        
        // Quick win check first (don't need workers for this)
        const quickWin = this.findWinningMove(simulationGame, this.player);
        if (quickWin !== -1) {
            console.log('Extreme AI: Found winning move:', quickWin);
            return quickWin;
        }
        
        const quickBlock = this.findWinningMove(simulationGame, HUMAN_PLAYER);
        if (quickBlock !== -1) {
            console.log('Extreme AI: Blocking opponent winning move:', quickBlock);
            return quickBlock;
        }
        
        // Use multi-core workers for extreme deep search (with fallback on error)
        try {
            if (this.useWorkers && this.workerPool && this.workerPool.length > 0) {
                const result = await this.runMultiCoreSearch(simulationGame, game);
                // Validate result before returning
                if (result !== -1 && result !== null && result >= 0 && result < 24) {
                    return result;
                }
                console.warn('Extreme AI: Multi-core search returned invalid result, falling back to single-threaded');
                // Fall through to single-threaded if worker result is invalid
            } else {
                console.log('Extreme AI: Workers not available, using single-threaded search');
            }
        } catch (error) {
            console.error('Multi-core search failed, falling back to single-threaded:', error);
        }
        
        // Fallback to single-threaded search (but still deeper for extreme)
        console.log('Extreme AI: Running single-threaded search');
        return await this.runSingleThreadedSearch(simulationGame);
    }

    async runHardSimpleLogicAsync(game) {
        // Hard difficulty uses single-threaded search at reasonable depth
        this.transpositionTable.clear();
        this.nodesEvaluated = 0;
        this.searchStartTime = performance.now();
        
        const simulationGame = { board: [...game.board], millPatterns: game.millPatterns };
        
        // Quick win check first
        const quickWin = this.findWinningMove(simulationGame, this.player);
        if (quickWin !== -1) return quickWin;
        
        const quickBlock = this.findWinningMove(simulationGame, HUMAN_PLAYER);
        if (quickBlock !== -1) return quickBlock;
        
        // Use single-threaded search for hard difficulty
        return await this.runSingleThreadedSearch(simulationGame);
    }

    getOptimalWorkerCount(moveCount) {
        // Dynamically adjust worker count based on number of moves to evaluate
        const readyWorkers = this.workerPool.filter(w => w && (w.ready !== false));
        if (readyWorkers.length === 0) return 0;
        
        // Calculate optimal workers: ensure at least MIN_MOVES_PER_WORKER moves per worker
        const maxWorkersByMoves = Math.floor(moveCount / MIN_MOVES_PER_WORKER);
        
        // For extreme difficulty, be more aggressive with worker usage
        if (this.difficulty === 'extreme') {
            // Use more workers even for fewer moves
            if (moveCount <= 2) return Math.min(2, readyWorkers.length);
            if (moveCount <= 4) return Math.min(4, readyWorkers.length);
            if (moveCount <= 8) return Math.min(6, readyWorkers.length);
            // Use all available workers for many moves
            return Math.min(maxWorkersByMoves, readyWorkers.length, MAX_WORKERS);
        }
        
        // For other difficulties, use conservative approach
        if (moveCount <= 3) return Math.min(1, readyWorkers.length);
        if (moveCount <= 6) return Math.min(2, readyWorkers.length);
        if (moveCount <= 12) return Math.min(4, readyWorkers.length);
        
        // For many moves, use more workers but cap at available
        const optimalWorkers = Math.min(maxWorkersByMoves, readyWorkers.length, MAX_WORKERS);
        return Math.max(1, optimalWorkers); // Always use at least 1 worker if available
    }

    async runMultiCoreSearch(simulationGame, game) {
        const emptyPositions = simulationGame.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        if (emptyPositions.length === 0) return this.makeRandomMove(game);
        
        // Order moves for better parallelization
        const orderedMoves = this.orderSimpleMovesAdvanced(simulationGame, emptyPositions, true);
        
        // Use iterative deepening with multi-core parallel search
        let bestMove = -1;
        let bestScore = -Infinity;
        
        // Adjust max depth and time based on difficulty - ABSOLUTE MAXIMUM for extreme
        const maxDepth = this.difficulty === 'extreme' ? MINIMAX_DEPTH_SIMPLE + 100 : MINIMAX_DEPTH_SIMPLE;
        const maxTime = this.difficulty === 'extreme' ? MAX_SEARCH_TIME_MS_EXTREME : MAX_SEARCH_TIME_MS;
        
        // Start deeper and go even deeper for extreme - ABSOLUTE MAXIMUM settings
        const startDepth = this.difficulty === 'extreme' ? 1 : 5;
        const depthIncrement = this.difficulty === 'extreme' ? 1 : 2; // Every single depth level for extreme
        
        for (let depth = startDepth; depth <= maxDepth; depth += depthIncrement) {
            if (this.isTimeUp(maxTime)) break;
            
            // Dynamically determine optimal worker count based on move count
            const optimalWorkerCount = this.getOptimalWorkerCount(orderedMoves.length);
            const readyWorkers = this.workerPool.filter(w => w && (w.ready !== false)).slice(0, optimalWorkerCount);
            
            if (readyWorkers.length === 0) {
                console.warn('No ready workers available, falling back to single-threaded');
                break; // Exit loop and fall through to single-threaded
            }
            
            console.log(`Extreme AI: Using ${readyWorkers.length} workers for ${orderedMoves.length} moves at depth ${depth}`);
            const movesPerWorker = Math.ceil(orderedMoves.length / readyWorkers.length);
            const promises = [];
            
            // Evaluate all moves in parallel using workers
            for (let i = 0; i < readyWorkers.length; i++) {
                const worker = readyWorkers[i];
                if (!worker) continue;
                
                const workerId = worker.id; // Use the original worker ID
                const startIdx = i * movesPerWorker;
                const endIdx = Math.min(startIdx + movesPerWorker, orderedMoves.length);
                const workerMoves = orderedMoves.slice(startIdx, endIdx);
                
                if (workerMoves.length === 0) {
                    promises.push(Promise.resolve({ workerId: workerId, moves: [], bestMove: -1, bestScore: -Infinity }));
                    continue;
                }
                
                // Create a promise for this worker's evaluation
                const promise = new Promise((resolve, reject) => {
                    let completedEvaluations = 0;
                    let workerBestMove = -1;
                    let workerBestScore = -Infinity;
                    let timeoutId = null;
                    let isResolved = false;
                    const searchId = Date.now() + Math.random(); // Unique ID for this search batch
                    
                    // Timeout after longer per depth level (ABSOLUTE MAXIMUM for extreme)
                    const timeoutMs = this.difficulty === 'extreme' ? 20000 : 1500;
                    timeoutId = setTimeout(() => {
                        if (isResolved) return;
                        isResolved = true;
                        worker.removeEventListener('message', handler);
                        worker.removeEventListener('error', errorHandler);
                        console.log(`Worker ${workerId} timeout after evaluating ${completedEvaluations}/${workerMoves.length} moves`);
                        resolve({ workerId: workerId, moves: workerMoves, bestMove: workerBestMove, bestScore: workerBestScore });
                    }, timeoutMs);
                    
                    const errorHandler = (error) => {
                        if (isResolved) return;
                        isResolved = true;
                        clearTimeout(timeoutId);
                        worker.removeEventListener('message', handler);
                        worker.removeEventListener('error', errorHandler);
                        console.error(`Worker ${workerId} error:`, error);
                        resolve({ workerId: workerId, moves: workerMoves, bestMove: workerBestMove, bestScore: workerBestScore });
                    };
                    
                    const handler = (e) => {
                        if (isResolved) return;
                        
                        // Only process messages that match our search and worker ID
                        if (e.data && e.data.type === 'result' && e.data.workerId === workerId) {
                            completedEvaluations++;
                            
                            // Track best result from this worker
                            if (e.data.result && typeof e.data.result.score === 'number') {
                                if (e.data.result.score > workerBestScore) {
                                    workerBestScore = e.data.result.score;
                                    workerBestMove = e.data.move;
                                }
                            }
                            
                            // When all moves for this worker are evaluated, resolve
                            if (completedEvaluations >= workerMoves.length) {
                                if (isResolved) return;
                                isResolved = true;
                                clearTimeout(timeoutId);
                                worker.removeEventListener('message', handler);
                                worker.removeEventListener('error', errorHandler);
                                resolve({ workerId: i, moves: workerMoves, bestMove: workerBestMove, bestScore: workerBestScore });
                            }
                        }
                    };
                    
                    // Remove any existing listeners first to avoid duplicates
                    worker.removeEventListener('message', handler);
                    worker.removeEventListener('error', errorHandler);
                    
                    worker.addEventListener('message', handler);
                    worker.addEventListener('error', errorHandler);
                    
                    // Send each move to worker for parallel evaluation
                    let messagesSent = 0;
                    workerMoves.forEach((move) => {
                        try {
                            const tempBoard = [...simulationGame.board];
                            tempBoard[move] = this.player;
                            const tempGameState = {
                                board: tempBoard,
                                millPatterns: simulationGame.millPatterns
                            };
                            
                            worker.postMessage({
                                type: 'search',
                                gameState: tempGameState,
                                move: move,
                                depth: depth - 1,
                                alpha: -Infinity,
                                beta: Infinity,
                                isMaximizing: false,
                                workerId: workerId,
                                searchId: searchId
                            });
                            messagesSent++;
                        } catch (error) {
                            console.error(`Failed to send message to worker ${workerId}:`, error);
                        }
                    });
                    
                    if (messagesSent === 0) {
                        // No messages were sent, resolve immediately
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            worker.removeEventListener('message', handler);
                            worker.removeEventListener('error', errorHandler);
                            resolve({ workerId: i, moves: workerMoves, bestMove: -1, bestScore: -Infinity });
                        }
                    }
                });
                
                promises.push(promise);
            }
            
            // Wait for all workers to complete (with error handling)
            const results = await Promise.allSettled(promises);
            
            // Find best move from all worker results
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    if (data && typeof data.bestScore === 'number' && data.bestScore > bestScore) {
                        bestScore = data.bestScore;
                        bestMove = data.bestMove;
                    }
                } else {
                    console.warn('Worker promise rejected:', result.reason);
                }
            }
            
            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
            
            if (bestScore >= MINIMAX_WIN_SCORE - depth * 1000) {
                break;
            }
            
            if (this.isTimeUp()) break;
        }
        
        // Fallback if no move found
        if (bestMove !== -1 && bestMove !== null && bestMove >= 0 && bestMove < 24) {
            console.log(`Extreme AI selected move: ${bestMove} with score: ${bestScore}`);
            return bestMove;
        }
        console.warn('Extreme AI: No valid move found, using random fallback');
        return this.makeRandomMove(game);
    }

    async runSingleThreadedSearch(simulationGame) {
        // Ensure searchStartTime is set if not already set
        if (this.searchStartTime === 0) {
            this.searchStartTime = performance.now();
        }
        
        let bestMove = -1;
        // Adjust max depth and time based on difficulty - ABSOLUTE MAXIMUM for extreme
        const maxDepth = this.difficulty === 'extreme' ? MINIMAX_DEPTH_SIMPLE + 100 : 15;
        const maxTime = this.difficulty === 'extreme' ? MAX_SEARCH_TIME_MS_EXTREME : MAX_SEARCH_TIME_MS;
        
        // Start deeper and use smaller increments for extreme - ABSOLUTE MAXIMUM settings
        const startDepth = this.difficulty === 'extreme' ? 1 : 5;
        const depthIncrement = this.difficulty === 'extreme' ? 1 : 2;
        
        for (let depth = startDepth; depth <= maxDepth; depth += depthIncrement) {
            if (this.isTimeUp(maxTime)) break;
            
            if (depth % 4 === 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            const result = this.minimaxSimpleWithTimeout(simulationGame, depth, -Infinity, Infinity, true, 0);
            if (result.move !== -1 && result.move !== null) {
                bestMove = result.move;
            }
            
            if (result.score >= MINIMAX_WIN_SCORE - depth * 1000) {
                break;
            }
        }
        
        return bestMove !== -1 ? bestMove : this.makeRandomMove(simulationGame);
    }


    runSimpleLogicSync(game) {
        switch (this.difficulty) {
            case 'easy':
                return this.makeRandomMove(game);
            case 'medium':
                return this.makeSimpleMediumMove(game);
            case 'hard':
                // Hard difficulty uses single-threaded search at reasonable depth
                this.transpositionTable.clear();
                this.nodesEvaluated = 0;
                const simulationGame = { board: [...game.board], millPatterns: game.millPatterns };
                
                // Quick win checks
                const quickWin = this.findWinningMove(simulationGame, this.player);
                if (quickWin !== -1) return quickWin;
                
                const quickBlock = this.findWinningMove(simulationGame, HUMAN_PLAYER);
                if (quickBlock !== -1) return quickBlock;
                
                // Use optimized iterative deepening with reasonable max depth (15)
                let bestMove = -1;
                for (let depth = 5; depth <= 15; depth += 2) {
                    const result = this.minimaxSimple(simulationGame, depth, -Infinity, Infinity, true, 0);
                    if (result.move !== -1 && result.move !== null) {
                        bestMove = result.move;
                    }
                    if (result.score >= MINIMAX_WIN_SCORE - depth * 1000) {
                        break;
                    }
                }
                return bestMove !== -1 ? bestMove : this.makeRandomMove(game);
            case 'extreme':
                // Extreme difficulty in sync mode (fallback) uses deeper search
                this.transpositionTable.clear();
                this.nodesEvaluated = 0;
                const extremeSimulationGame = { board: [...game.board], millPatterns: game.millPatterns };
                
                const extremeQuickWin = this.findWinningMove(extremeSimulationGame, this.player);
                if (extremeQuickWin !== -1) return extremeQuickWin;
                
                const extremeQuickBlock = this.findWinningMove(extremeSimulationGame, HUMAN_PLAYER);
                if (extremeQuickBlock !== -1) return extremeQuickBlock;
                
                // Use deeper search for extreme (up to 20 depth)
                let extremeBestMove = -1;
                for (let depth = 5; depth <= MINIMAX_DEPTH_SIMPLE; depth += 2) {
                    const result = this.minimaxSimple(extremeSimulationGame, depth, -Infinity, Infinity, true, 0);
                    if (result.move !== -1 && result.move !== null) {
                        extremeBestMove = result.move;
                    }
                    if (result.score >= MINIMAX_WIN_SCORE - depth * 1000) {
                        break;
                    }
                }
                return extremeBestMove !== -1 ? extremeBestMove : this.makeRandomMove(game);
            default:
                return this.makeSimpleMediumMove(game);
        }
    }

    isTimeUp(maxTime = MAX_SEARCH_TIME_MS) {
        if (this.searchStartTime === 0) return false; // Not started yet
        return (performance.now() - this.searchStartTime) > maxTime;
    }

    minimaxSimpleWithTimeout(game, depth, alpha, beta, isMaximizing, ply) {
        // Check timeout every N nodes to avoid overhead
        const maxTime = this.difficulty === 'extreme' ? MAX_SEARCH_TIME_MS_EXTREME : MAX_SEARCH_TIME_MS;
        if (this.nodesEvaluated % 1000 === 0 && this.isTimeUp(maxTime)) {
            return { move: -1, score: isMaximizing ? -Infinity : Infinity };
        }
        return this.minimaxSimple(game, depth, alpha, beta, isMaximizing, ply);
    }

    makeSimpleMediumMove(game) {
        const winningMove = this.findWinningMove(game, this.player);
        if (winningMove !== -1) return winningMove;

        const blockingMove = this.findWinningMove(game, HUMAN_PLAYER);
        if (blockingMove !== -1) return blockingMove;

        return this.makeRandomMove(game);
    }

    makeRandomMove(game) {
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        if (emptyPositions.length === 0) return -1;
        return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    }
    
    minimaxSimple(game, depth, alpha, beta, isMaximizing, ply) {
        this.nodesEvaluated++;
        
        // Periodic timeout check (optimized - every 500 nodes for speed)
        const maxTime = this.difficulty === 'extreme' ? MAX_SEARCH_TIME_MS_EXTREME : MAX_SEARCH_TIME_MS;
        if (this.searchStartTime > 0 && this.nodesEvaluated % 500 === 0 && this.isTimeUp(maxTime)) {
            return { move: -1, score: isMaximizing ? -Infinity : Infinity };
        }
        
        if (!game || !game.board) {
            return { move: null, score: MINIMAX_DRAW_SCORE };
        }
        
        // Transposition table lookup
        const boardKey = this.getBoardKey(game.board);
        const ttEntry = this.transpositionTable.get(boardKey);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === 'EXACT') {
                return { move: ttEntry.move, score: ttEntry.score };
            } else if (ttEntry.flag === 'LOWER' && ttEntry.score >= beta) {
                return { move: ttEntry.move, score: ttEntry.score };
            } else if (ttEntry.flag === 'UPPER' && ttEntry.score <= alpha) {
                return { move: ttEntry.move, score: ttEntry.score };
            }
        }
        
        const winner = this.checkSimpleWinner(game);
        if (winner !== null) {
            // Depth bonus: faster wins are ABSOLUTE MAXIMUM better (massive multiplier)
            const depthBonus = depth * 200000; // ABSOLUTE MAXIMUM bonus for faster wins
            const score = winner === this.player ? (MINIMAX_WIN_SCORE + depthBonus) : (MINIMAX_LOSS_SCORE - depthBonus);
            this.storeTransposition(boardKey, null, score, depth, 'EXACT');
            return { move: null, score: score };
        }
        
        if (depth === 0) {
            // Quiescence search: continue searching in tactical positions
            return this.quiescenceSearch(game, alpha, beta, isMaximizing, 0);
        }
        
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        if (emptyPositions.length === 0) {
            const score = MINIMAX_DRAW_SCORE;
            this.storeTransposition(boardKey, null, score, depth, 'EXACT');
            return { move: null, score: score };
        }
        
        // Enhanced move ordering with evaluation scores
        const orderedMoves = this.orderSimpleMovesAdvanced(game, emptyPositions, isMaximizing);
        let bestMove = -1;
        let bestScore = isMaximizing ? -Infinity : Infinity;
        let originalAlpha = alpha;
        
        if (isMaximizing) {
            for (const move of orderedMoves) {
                game.board[move] = this.player;
                let evalScore = this.minimaxSimple(game, depth - 1, alpha, beta, false, ply + 1).score;
                game.board[move] = null;
                if (evalScore > bestScore) {
                    bestScore = evalScore;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
        } else {
            for (const move of orderedMoves) {
                game.board[move] = HUMAN_PLAYER;
                let evalScore = this.minimaxSimple(game, depth - 1, alpha, beta, true, ply + 1).score;
                game.board[move] = null;
                if (evalScore < bestScore) {
                    bestScore = evalScore;
                    bestMove = move;
                }
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
        }
        
        // Store in transposition table
        const flag = bestScore <= originalAlpha ? 'UPPER' : (bestScore >= beta ? 'LOWER' : 'EXACT');
        this.storeTransposition(boardKey, bestMove, bestScore, depth, flag);
        
        return { move: bestMove, score: bestScore };
    }

    quiescenceSearch(game, alpha, beta, isMaximizing, qDepth) {
        // Quiescence search: continue searching in tactical positions (mills, threats)
        const standPat = this.evaluateSimplePosition(game);
        
        // Beta cutoff: if we're already good enough, stop searching
        if (isMaximizing) {
            if (standPat >= beta) return { move: null, score: beta };
            alpha = Math.max(alpha, standPat);
        } else {
            if (standPat <= alpha) return { move: null, score: alpha };
            beta = Math.min(beta, standPat);
        }
        
        // Limit quiescence depth
        if (qDepth >= QUIESCENCE_DEPTH) {
            return { move: null, score: standPat };
        }
        
        // Only search tactical moves: winning moves, blocking moves, creating threats
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        const player = isMaximizing ? this.player : HUMAN_PLAYER;
        const tacticalMoves = [];
        
        for (const move of emptyPositions) {
            const tempBoard = [...game.board];
            tempBoard[move] = player;
            const createsMill = this.checkSimpleWinner({ board: tempBoard, millPatterns: game.millPatterns }) === player;
            const blocksOpponent = this.blocksOpponentMill(move, player === this.player ? HUMAN_PLAYER : this.player, game);
            const createsThreat = this.createsSimpleSetup(move, player, game);
            
            if (createsMill || blocksOpponent || createsThreat) {
                tacticalMoves.push(move);
            }
        }
        
        // If no tactical moves, return static evaluation
        if (tacticalMoves.length === 0) {
            return { move: null, score: standPat };
        }
        
        // Search tactical moves
        let bestScore = standPat;
        const orderedTactical = this.orderSimpleMovesAdvanced(game, tacticalMoves, isMaximizing);
        
        for (const move of orderedTactical) {
            game.board[move] = player;
            const result = this.quiescenceSearch(game, alpha, beta, !isMaximizing, qDepth + 1);
            game.board[move] = null;
            
            if (isMaximizing) {
                bestScore = Math.max(bestScore, result.score);
                alpha = Math.max(alpha, bestScore);
            } else {
                bestScore = Math.min(bestScore, result.score);
                beta = Math.min(beta, bestScore);
            }
            
            if (beta <= alpha) break; // Alpha-beta cutoff
        }
        
        return { move: null, score: bestScore };
    }

    getBoardKey(board) {
        return board.join(',');
    }

    storeTransposition(key, move, score, depth, flag) {
        if (!this.transpositionTable.has(key) || this.transpositionTable.get(key).depth <= depth) {
            this.transpositionTable.set(key, { move, score, depth, flag });
        }
    }

    orderSimpleMovesAdvanced(game, moves, isMaximizing) {
        const player = isMaximizing ? this.player : HUMAN_PLAYER;
        const opponent = isMaximizing ? HUMAN_PLAYER : this.player;
        
        // Score each move and sort by score - MAXIMUM ordering quality
        const movesWithScores = moves.map(move => {
            const tempBoard = [...game.board];
            tempBoard[move] = player;
            const createsMill = this.checkSimpleWinner({ board: tempBoard, millPatterns: game.millPatterns }) === player;
            const blocksOpponent = this.blocksOpponentMill(move, opponent, game);
            const createsSetup = this.createsSimpleSetup(move, player, game);
            const blocksOpponentSetup = this.blocksOpponentSimpleSetup(move, opponent, game);
            const strategicValue = this.isStrategicPosition(move) ? STRATEGIC_POSITION_SCORE : 0;
            
            // Count how many patterns this move affects
            let patternInfluence = 0;
            for (const pattern of game.millPatterns) {
                if (pattern.includes(move)) {
                    const pieces = pattern.map(p => tempBoard[p]);
                    const playerPieces = pieces.filter(p => p === player).length;
                    if (playerPieces >= 1) patternInfluence += playerPieces * 2;
                }
            }
            
            let score = 0;
            if (createsMill) score += MILL_SCORE * 100; // ABSOLUTE MAXIMUM priority for winning moves - 100x!!!
            if (blocksOpponent) score += SETUP_SCORE * 30; // ABSOLUTE MAXIMUM priority for blocking wins - 30x
            if (createsSetup) score += SETUP_SCORE * 15; // ABSOLUTE MAXIMUM - almost doubled
            if (blocksOpponentSetup) score += SETUP_SCORE * 10; // ABSOLUTE MAXIMUM - doubled
            score += strategicValue * 10; // ABSOLUTE MAXIMUM strategic value - 10x
            score += patternInfluence * 50; // ABSOLUTE MAXIMUM pattern influence bonus - 5x
            
            // Evaluate position after move (ABSOLUTE MAXIMUM deeper evaluation)
            score += this.evaluateSimpleMove(game, move, player) * 10; // ABSOLUTE MAXIMUM - 10x multiplier
            
            return { move, score };
        });
        
        // Sort by score (highest first for maximizing, lowest first for minimizing)
        return movesWithScores
            .sort((a, b) => isMaximizing ? (b.score - a.score) : (a.score - b.score))
            .map(m => m.move);
    }

    createsSimpleSetup(position, player, game) {
        for (const pattern of game.millPatterns) {
            if (pattern.includes(position)) {
                const pieces = pattern.map(p => game.board[p]);
                const playerPieces = pieces.filter(p => p === player).length;
                const empty = pieces.filter(p => p === null).length;
                if (playerPieces === 1 && empty === 2) return true;
            }
        }
        return false;
    }

    blocksOpponentSimpleSetup(position, opponent, game) {
        for (const pattern of game.millPatterns) {
            if (pattern.includes(position)) {
                const pieces = pattern.map(p => game.board[p]);
                const opponentPieces = pieces.filter(p => p === opponent).length;
                const empty = pieces.filter(p => p === null).length;
                if (opponentPieces === 1 && empty === 2) return true;
            }
        }
        return false;
    }

    evaluateSimpleMove(game, position, player) {
        // Quick evaluation of move quality
        const tempBoard = [...game.board];
        tempBoard[position] = player;
        let score = 0;
        
        // Count how many mill patterns this position is part of
        let patternCount = 0;
        for (const pattern of game.millPatterns) {
            if (pattern.includes(position)) {
                patternCount++;
                const pieces = pattern.map(p => tempBoard[p]);
                const playerPieces = pieces.filter(p => p === player).length;
                if (playerPieces === 2) score += DOUBLE_SETUP_SCORE; // Multiple setup opportunities
            }
        }
        
        // Being part of multiple patterns is valuable
        score += patternCount * 5;
        
        return score;
    }

    isStrategicPosition(position) {
        // Strategic positions: corners and intersections that are part of multiple mill patterns
        const strategicPositions = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]; // Inner positions
        return strategicPositions.includes(position);
    }

    blocksOpponentMill(position, opponent, game) {
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

    evaluateSimplePosition(game) {
        // Comprehensive evaluation of board position with enhanced strategic analysis
        let score = 0;
        let aiSetupCount = 0;
        let humanSetupCount = 0;
        let aiDoubleSetupCount = 0; // Positions that create multiple setup opportunities
        let humanDoubleSetupCount = 0;
        let aiThreats = 0; // Positions where AI can create a mill next turn
        let humanThreats = 0;
        
        // Check all mill patterns
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(p => game.board[p]);
            const aiPieces = pieces.filter(p => p === this.player).length;
            const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
            const empty = pieces.filter(p => p === null).length;
            
            // AI potential mills (ABSOLUTE MAXIMUM weight)
            if (aiPieces === 2 && empty === 1) {
                score += SETUP_SCORE * 10.0; // ABSOLUTE MAXIMUM weight - 10x multiplier
                aiSetupCount++;
                aiThreats++;
            }
            if (aiPieces === 1 && empty === 2) {
                score += SETUP_SCORE * 3.0; // ABSOLUTE MAXIMUM - tripled
            }
            
            // Opponent potential mills (negative score, ABSOLUTE MAXIMUM weight)
            if (humanPieces === 2 && empty === 1) {
                score -= SETUP_SCORE * 10.0; // ABSOLUTE MAXIMUM weight - 10x multiplier
                humanSetupCount++;
                humanThreats++;
            }
            if (humanPieces === 1 && empty === 2) {
                score -= SETUP_SCORE * 3.0; // ABSOLUTE MAXIMUM - tripled
            }
        }
        
        // Check for double setups (one position completes multiple potential mills)
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        for (const pos of emptyPositions) {
            let aiPatterns = 0;
            let humanPatterns = 0;
            
            for (const pattern of game.millPatterns) {
                if (pattern.includes(pos)) {
                    const pieces = pattern.map(p => game.board[p]);
                    const aiPieces = pieces.filter(p => p === this.player).length;
                    const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
                    const empty = pieces.filter(p => p === null).length;
                    
                    if (aiPieces === 2 && empty === 1) aiPatterns++;
                    if (humanPieces === 2 && empty === 1) humanPatterns++;
                }
            }
            
            if (aiPatterns >= 2) {
                score += DOUBLE_SETUP_SCORE * aiPatterns * 10.0; // ABSOLUTE MAXIMUM multiplier - 10x
                aiDoubleSetupCount++;
            }
            if (humanPatterns >= 2) {
                score -= DOUBLE_SETUP_SCORE * humanPatterns * 10.0; // ABSOLUTE MAXIMUM multiplier - 10x
                humanDoubleSetupCount++;
            }
        }
        
        // Piece control: count pieces on board (ABSOLUTE MAXIMUM weight)
        const aiPiecesOnBoard = game.board.filter(p => p === this.player).length;
        const humanPiecesOnBoard = game.board.filter(p => p === HUMAN_PLAYER).length;
        score += (aiPiecesOnBoard - humanPiecesOnBoard) * 100; // ABSOLUTE MAXIMUM - 10x
        
        // Strategic position control (ABSOLUTE MAXIMUM weight)
        const strategicPositions = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
        for (const pos of strategicPositions) {
            if (game.board[pos] === this.player) score += STRATEGIC_POSITION_SCORE * 10.0; // ABSOLUTE MAXIMUM - 10x
            if (game.board[pos] === HUMAN_PLAYER) score -= STRATEGIC_POSITION_SCORE * 10.0; // ABSOLUTE MAXIMUM - 10x
        }
        
        // Bonus for having more setup opportunities than opponent (ABSOLUTE MAXIMUM)
        if (aiSetupCount > humanSetupCount) {
            score += (aiSetupCount - humanSetupCount) * 2000; // ABSOLUTE MAXIMUM - 4x more
        }
        if (humanSetupCount > aiSetupCount) {
            score -= (humanSetupCount - aiSetupCount) * 2000; // ABSOLUTE MAXIMUM - 4x more
        }
        
        // Threat advantage: having more immediate threats is ABSOLUTE MAXIMUM valuable
        if (aiThreats > humanThreats) {
            score += (aiThreats - humanThreats) * THREAT_SCORE * 10; // ABSOLUTE MAXIMUM - 10x multiplier
        }
        if (humanThreats > aiThreats) {
            score -= (humanThreats - aiThreats) * THREAT_SCORE * 10; // ABSOLUTE MAXIMUM - 10x multiplier
        }
        
        // Pattern control: control of multiple intersecting patterns (ABSOLUTE MAXIMUM)
        const patternControl = this.calculatePatternControl(game);
        score += patternControl * PATTERN_CONTROL_SCORE * 5; // ABSOLUTE MAXIMUM - 5x
        
        // Additional: Mobility advantage (more future options) - ABSOLUTE MAXIMUM
        const aiMobility = this.calculateMobility(game, this.player);
        const humanMobility = this.calculateMobility(game, HUMAN_PLAYER);
        score += (aiMobility - humanMobility) * MOBILITY_SCORE * 10; // ABSOLUTE MAXIMUM - 10x
        
        // Endgame evaluation: ABSOLUTE MAXIMUM aggressive when pieces are running out
        const totalPieces = aiPiecesOnBoard + humanPiecesOnBoard;
        if (totalPieces > 12) {
            // Early game: focus on position
            score *= 1.5; // ABSOLUTE MAXIMUM - even early game gets massive boost
        } else if (totalPieces > 6) {
            // Mid game: balance position and material
            score *= 2.0; // ABSOLUTE MAXIMUM - doubled
        } else {
            // Endgame: material and threats are ABSOLUTE MAXIMUM critical
            score *= 3.0; // ABSOLUTE MAXIMUM - tripled!
            // Extra bonus for piece advantage in endgame - ABSOLUTE MAXIMUM
            if (aiPiecesOnBoard > humanPiecesOnBoard) {
                score += (aiPiecesOnBoard - humanPiecesOnBoard) * ENDGAME_PIECE_BONUS; // ABSOLUTE MAXIMUM
            }
        }
        
        // Tempo: having the initiative is ABSOLUTE MAXIMUM valuable
        const aiTempo = this.calculateTempo(game, this.player);
        const humanTempo = this.calculateTempo(game, HUMAN_PLAYER);
        score += (aiTempo - humanTempo) * TEMPO_SCORE * 2; // ABSOLUTE MAXIMUM - doubled
        
        return score;
    }
    
    calculateTempo(game, player) {
        // Calculate tempo: how many immediate threats/options a player has
        let tempo = 0;
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        
        for (const pos of emptyPositions) {
            const tempBoard = [...game.board];
            tempBoard[pos] = player;
            
            // Check if this move creates a mill
            if (this.checkSimpleWinner({ board: tempBoard, millPatterns: game.millPatterns }) === player) {
                tempo += 200; // ABSOLUTE MAXIMUM - immediate win threat (20x!)
            }
            
            // Check if this move creates a setup
            if (this.createsSimpleSetup(pos, player, game)) {
                tempo += 30; // ABSOLUTE MAXIMUM - 10x
            }
            
            // Check if this move blocks opponent
            const opponent = player === this.player ? HUMAN_PLAYER : this.player;
            if (this.blocksOpponentMill(pos, opponent, game)) {
                tempo += 50; // ABSOLUTE MAXIMUM - 10x
            }
        }
        
        return tempo;
    }
    
    calculatePatternControl(game) {
        // Calculate how many mill patterns the AI controls vs opponent
        let aiControl = 0;
        let humanControl = 0;
        
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(p => game.board[p]);
            const aiPieces = pieces.filter(p => p === this.player).length;
            const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
            const empty = pieces.filter(p => p === null).length;
            
            // Control means having 2+ pieces in a pattern
            if (aiPieces >= 2 && humanPieces === 0) aiControl++;
            if (humanPieces >= 2 && aiPieces === 0) humanControl++;
        }
        
        return aiControl - humanControl;
    }
    
    calculateMobility(game, player) {
        // Calculate how many potential moves/options a player has
        const emptyPositions = game.board.map((p, i) => (p === null ? i : null)).filter(p => p !== null);
        let mobility = 0;
        
        for (const pos of emptyPositions) {
            // Count how many patterns this position is part of (more patterns = more mobility)
            let patternCount = 0;
            for (const pattern of game.millPatterns) {
                if (pattern.includes(pos)) {
                    const pieces = pattern.map(p => game.board[p]);
                    const playerPieces = pieces.filter(p => p === player).length;
                    // If player has pieces in this pattern, it's valuable
                    if (playerPieces > 0) patternCount++;
                }
            }
            mobility += patternCount;
        }
        
        return mobility;
    }

    checkSimpleWinner(game) {
        for (const pattern of game.millPatterns) {
            const p1 = game.board[pattern[0]];
            if (p1 !== null && p1 === game.board[pattern[1]] && p1 === game.board[pattern[2]]) {
                return p1;
            }
        }
        return null;
    }

    runClassicLogic(game) {
        if (this.difficulty === 'hard' || this.difficulty === 'extreme') {
            // Use full minimax with deep search for hard/extreme difficulty
            const simulationGame = {
                board: [...game.board],
                millPatterns: game.millPatterns,
                adjacencyMap: game.adjacencyMap,
                piecesLeft: { ...game.piecesLeft },
                piecesOnBoard: { ...game.piecesOnBoard },
                currentPlayer: game.currentPlayer
            };
            // Extreme uses deeper search for classic mode
            const depth = this.difficulty === 'extreme' ? Math.min(MINIMAX_DEPTH_CLASSIC + 2, 10) : MINIMAX_DEPTH_CLASSIC;
            const result = this.minimaxClassic(simulationGame, depth, -Infinity, Infinity, true);
            if (result.move && result.move.to !== null) {
                return result.move;
            }
        }
        
        // Fallback to heuristic-based approach for medium/easy
        const opponent = HUMAN_PLAYER;
        const allMyMoves = this.generateAllMoves(game, this.player);
        if (allMyMoves.length === 0) {
            console.warn('AI has no valid moves');
            return { from: null, to: null, remove: null };
        }

        const millMoves = allMyMoves.filter(m => m.createsMill);
        if (millMoves.length > 0) {
            const move = millMoves[0];
            move.remove = this.choosePieceToRemove(game, opponent, move.board);
            return move;
        }

        const opponentWinningMove = this.findWinningMove(game, opponent);
        if (opponentWinningMove !== -1) {
            const blockingMove = allMyMoves.find(myMove => myMove.to === opponentWinningMove);
            if (blockingMove) return blockingMove;
        }
        
        const setupMoves = allMyMoves.filter(move => this.createsSetup(move, this.player, game.millPatterns));
        if (setupMoves.length > 0) return setupMoves[Math.floor(Math.random() * setupMoves.length)];

        const allOpponentMoves = this.generateAllMoves(game, opponent);
        const opponentSetupMove = allOpponentMoves.find(move => this.createsSetup(move, opponent, game.millPatterns));
        if (opponentSetupMove) {
            const blockingMove = allMyMoves.find(myMove => myMove.to === opponentSetupMove.to);
            if (blockingMove) return blockingMove;
        }

        return allMyMoves[Math.floor(Math.random() * allMyMoves.length)];
    }

    minimaxClassic(game, depth, alpha, beta, isMaximizing) {
        const player = isMaximizing ? this.player : HUMAN_PLAYER;
        
        // Check terminal conditions
        const terminalResult = this.checkTerminalState(game, player);
        if (terminalResult !== null) {
            const depthBonus = depth * 1000;
            if (terminalResult === 'win') {
                return { move: null, score: isMaximizing ? (MINIMAX_WIN_SCORE + depthBonus) : (MINIMAX_LOSS_SCORE - depthBonus) };
            }
            if (terminalResult === 'loss') {
                return { move: null, score: isMaximizing ? (MINIMAX_LOSS_SCORE - depthBonus) : (MINIMAX_WIN_SCORE + depthBonus) };
            }
            return { move: null, score: MINIMAX_DRAW_SCORE };
        }

        if (depth === 0) {
            return { move: null, score: this.evaluateClassicPosition(game) };
        }

        const allMoves = this.generateAllMoves(game, player);
        if (allMoves.length === 0) {
            // No valid moves means loss
            const depthBonus = depth * 1000;
            return { move: null, score: isMaximizing ? (MINIMAX_LOSS_SCORE - depthBonus) : (MINIMAX_WIN_SCORE + depthBonus) };
        }

        // Order moves for better alpha-beta pruning
        const orderedMoves = this.orderClassicMoves(allMoves, game, player);
        let bestMove = null;
        let bestScore = isMaximizing ? -Infinity : Infinity;

        for (const move of orderedMoves) {
            // Apply move
            const originalBoard = [...game.board];
            const originalPiecesLeft = { ...game.piecesLeft };
            const originalPiecesOnBoard = { ...game.piecesOnBoard };
            
            game.board[move.to] = player;
            if (move.from !== null) {
                game.board[move.from] = null;
            } else {
                game.piecesLeft[player]--;
                game.piecesOnBoard[player]++;
            }

            let evalScore;
            if (move.createsMill) {
                // Need to remove opponent piece
                const opponent = player === this.player ? HUMAN_PLAYER : this.player;
                const removablePieces = this.getRemovablePieces(game, opponent, game.board);
                if (removablePieces.length > 0) {
                    // Try removing the best piece (use evaluation to choose)
                    let bestRemovalScore = isMaximizing ? -Infinity : Infinity;
                    let bestRemovePosition = removablePieces[0];
                    
                    for (const removePos of removablePieces) {
                        game.board[removePos] = null;
                        game.piecesOnBoard[opponent]--;
                        const removeEval = this.minimaxClassic(game, depth - 1, alpha, beta, !isMaximizing).score;
                        game.board[removePos] = opponent;
                        game.piecesOnBoard[opponent]++;
                        
                        if (isMaximizing && removeEval > bestRemovalScore) {
                            bestRemovalScore = removeEval;
                            bestRemovePosition = removePos;
                        } else if (!isMaximizing && removeEval < bestRemovalScore) {
                            bestRemovalScore = removeEval;
                            bestRemovePosition = removePos;
                        }
                    }
                    
                    game.board[bestRemovePosition] = null;
                    game.piecesOnBoard[opponent]--;
                    move.remove = bestRemovePosition;
                    evalScore = this.minimaxClassic(game, depth - 1, alpha, beta, !isMaximizing).score;
                    game.board[bestRemovePosition] = opponent;
                    game.piecesOnBoard[opponent]++;
                } else {
                    evalScore = this.minimaxClassic(game, depth - 1, alpha, beta, !isMaximizing).score;
                }
            } else {
                evalScore = this.minimaxClassic(game, depth - 1, alpha, beta, !isMaximizing).score;
            }

            // Restore game state
            game.board = originalBoard;
            game.piecesLeft = originalPiecesLeft;
            game.piecesOnBoard = originalPiecesOnBoard;

            if (isMaximizing) {
                if (evalScore > bestScore) {
                    bestScore = evalScore;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evalScore);
            } else {
                if (evalScore < bestScore) {
                    bestScore = evalScore;
                    bestMove = move;
                }
                beta = Math.min(beta, evalScore);
            }

            if (beta <= alpha) break; // Alpha-beta pruning
        }

        return { move: bestMove, score: bestScore };
    }

    checkTerminalState(game, lastPlayer) {
        // Check if last player won (has a mill)
        for (const pattern of game.millPatterns) {
            if (pattern.every(p => game.board[p] === lastPlayer)) {
                return 'win';
            }
        }

        // Check if opponent has fewer than 3 pieces and is not in placing phase
        const opponent = lastPlayer === this.player ? HUMAN_PLAYER : this.player;
        if (game.piecesLeft[opponent] === 0 && game.piecesOnBoard[opponent] < MIN_PIECES_FOR_FLYING) {
            return 'win';
        }

        // Check if current player can't move
        const allMoves = this.generateAllMoves(game, opponent);
        if (allMoves.length === 0 && game.piecesLeft[opponent] === 0) {
            return 'win';
        }

        return null;
    }

    evaluateClassicPosition(game) {
        let score = 0;
        const aiPiecesOnBoard = game.piecesOnBoard[this.player];
        const humanPiecesOnBoard = game.piecesOnBoard[HUMAN_PLAYER];
        
        // Piece count difference
        score += (aiPiecesOnBoard - humanPiecesOnBoard) * 50;
        
        // Mobility: count possible moves
        const aiMoves = this.generateAllMoves(game, this.player).length;
        const humanMoves = this.generateAllMoves(game, HUMAN_PLAYER).length;
        score += (aiMoves - humanMoves) * MOBILITY_SCORE;
        
        // Evaluate mills and setups
        for (const pattern of game.millPatterns) {
            const pieces = pattern.map(p => game.board[p]);
            const aiPieces = pieces.filter(p => p === this.player).length;
            const humanPieces = pieces.filter(p => p === HUMAN_PLAYER).length;
            const empty = pieces.filter(p => p === null).length;
            
            // AI potential mills
            if (aiPieces === 2 && empty === 1) score += SETUP_SCORE;
            if (aiPieces === 1 && empty === 2) score += SETUP_SCORE / 2;
            
            // Opponent potential mills
            if (humanPieces === 2 && empty === 1) score -= SETUP_SCORE;
            if (humanPieces === 1 && empty === 2) score -= SETUP_SCORE / 2;
            
            // Existing mills
            if (aiPieces === 3) score += MILL_SCORE;
            if (humanPieces === 3) score -= MILL_SCORE;
        }
        
        // Strategic positions (corners and intersections)
        const strategicPositions = [0, 2, 4, 6, 16, 18, 20, 22];
        for (const pos of strategicPositions) {
            if (game.board[pos] === this.player) score += 5;
            if (game.board[pos] === HUMAN_PLAYER) score -= 5;
        }
        
        return score;
    }

    orderClassicMoves(moves, game, player) {
        return moves.sort((a, b) => {
            // Prioritize moves that create mills
            if (a.createsMill && !b.createsMill) return -1;
            if (!a.createsMill && b.createsMill) return 1;
            
            // Then prioritize moves that create setups
            const aSetup = this.createsSetup(a, player, game.millPatterns);
            const bSetup = this.createsSetup(b, player, game.millPatterns);
            if (aSetup && !bSetup) return -1;
            if (!aSetup && bSetup) return 1;
            
            // Then prioritize moves that block opponent setups
            const opponent = player === this.player ? HUMAN_PLAYER : this.player;
            const aBlocks = this.blocksOpponentSetup(a, opponent, game);
            const bBlocks = this.blocksOpponentSetup(b, opponent, game);
            if (aBlocks && !bBlocks) return -1;
            if (!aBlocks && bBlocks) return 1;
            
            return 0;
        });
    }

    blocksOpponentSetup(move, opponent, game) {
        for (const pattern of game.millPatterns) {
            if (pattern.includes(move.to)) {
                const pieces = pattern.map(p => move.board[p]);
                if (pieces.filter(p => p === opponent).length === 2 && pieces.includes(null)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    createsSetup(move, player, millPatterns) {
        return millPatterns.some(pattern => {
            if (!pattern.includes(move.to)) return false;
            const pieces = pattern.map(p => move.board[p]);
            return pieces.filter(p => p === player).length === 2 && pieces.filter(p => p === null).length === 1;
        });
    }

    choosePieceToRemove(game, opponent, boardState) {
        const removablePieces = this.getRemovablePieces(game, opponent, boardState);
        if (removablePieces.length === 0) return null;
        
        // Strategic removal: remove pieces that are part of setups or in strategic positions
        let bestRemoval = removablePieces[0];
        let bestScore = -Infinity;
        
        for (const pos of removablePieces) {
            let score = 0;
            // Check if piece is part of a potential mill setup
            for (const pattern of game.millPatterns) {
                if (pattern.includes(pos)) {
                    const pieces = pattern.map(p => boardState[p]);
                    const opponentPieces = pieces.filter(p => p === opponent).length;
                    if (opponentPieces === 2) score += 50; // Breaking a setup is valuable
                    if (opponentPieces === 1) score += 10;
                }
            }
            // Strategic positions (prefer removing from corners/intersections)
            const strategicPositions = [0, 2, 4, 6, 16, 18, 20, 22];
            if (strategicPositions.includes(pos)) score += 5;
            
            if (score > bestScore) {
                bestScore = score;
                bestRemoval = pos;
            }
        }
        
        return bestRemoval;
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

    generateAllMoves(game, player) {
        let moves = [];
        const board = game.board;
        const gamePhase = (game.piecesLeft[player] > 0) ? 'placing' : (game.piecesOnBoard[player] === MIN_PIECES_FOR_FLYING ? 'flying' : 'moving');

        if (gamePhase === 'placing') {
            for (let i = 0; i < board.length; i++) {
                if (board[i] === null) {
                    const tempBoard = [...board];
                    tempBoard[i] = player;
                    moves.push({ from: null, to: i, remove: null, createsMill: this.isPositionInMill(i, player, tempBoard, game.millPatterns), board: tempBoard });
                }
            }
        } else {
            const playerPieces = [...board.keys()].filter(i => board[i] === player);
            const isFlying = gamePhase === 'flying';
            for (const from of playerPieces) {
                const destinations = isFlying ? [...board.keys()].filter(i => board[i] === null) : game.adjacencyMap[from].filter(i => board[i] === null);
                for (const to of destinations) {
                    const tempBoard = [...board];
                    tempBoard[to] = player;
                    tempBoard[from] = null;
                    moves.push({ from: from, to: to, remove: null, createsMill: this.isPositionInMill(to, player, tempBoard, game.millPatterns), board: tempBoard });
                }
            }
        }
        return moves;
    }

    getRemovablePieces(game, player, boardState) {
        const board = boardState || game.board;
        const allPieces = [...board.keys()].filter(i => board[i] === player);
        const nonMillPieces = allPieces.filter(p => !this.isPositionInMill(p, player, board, game.millPatterns));
        return nonMillPieces.length > 0 ? nonMillPieces : allPieces;
    }

    isPositionInMill(position, player, board, millPatterns) {
        if (position === null || player === null) return false;
        return millPatterns.some(pattern => pattern.includes(position) && pattern.every(p => board[p] === player));
    }
};