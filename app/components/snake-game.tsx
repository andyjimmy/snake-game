'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, RotateCcw, Trophy, Zap, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'

const CELL_SIZE = 20
// 35×35 = 1,225 cells — roughly double the original 25×25 (625) play area
const GRID_WIDTH = 35
const GRID_HEIGHT = 35
const START: Point = { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) }
const CANVAS_WIDTH = CELL_SIZE * GRID_WIDTH
const CANVAS_HEIGHT = CELL_SIZE * GRID_HEIGHT
const INITIAL_SPEED = 150
const MIN_SPEED = 60
const SPEED_INCREMENT = 3

type Point = { x: number; y: number }
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
type GameState = 'IDLE' | 'PLAYING' | 'GAME_OVER'
type Fruit = { name: string; emoji: string; points: number; weight: number; glow: string }
type Food = Point & { fruit: Fruit }

// Rarer fruits are worth more points
const FRUITS: Fruit[] = [
  { name: 'Apple', emoji: '🍎', points: 10, weight: 30, glow: '#ef4444' },
  { name: 'Banana', emoji: '🍌', points: 15, weight: 22, glow: '#facc15' },
  { name: 'Orange', emoji: '🍊', points: 15, weight: 18, glow: '#f97316' },
  { name: 'Cherries', emoji: '🍒', points: 20, weight: 12, glow: '#dc2626' },
  { name: 'Grapes', emoji: '🍇', points: 25, weight: 9, glow: '#a855f7' },
  { name: 'Strawberry', emoji: '🍓', points: 30, weight: 6, glow: '#f43f5e' },
  { name: 'Watermelon', emoji: '🍉', points: 50, weight: 3, glow: '#22c55e' },
]
const TOTAL_WEIGHT = FRUITS.reduce((sum, f) => sum + f.weight, 0)

function randomFruit(): Fruit {
  let roll = Math.random() * TOTAL_WEIGHT
  for (const f of FRUITS) {
    roll -= f.weight
    if (roll < 0) return f
  }
  return FRUITS[0]
}

function randomFood(snake: Point[]): Food {
  let pos: Point
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_WIDTH),
      y: Math.floor(Math.random() * GRID_HEIGHT),
    }
  } while ((snake ?? []).some((s: Point) => s?.x === pos.x && s?.y === pos.y))
  return { ...pos, fruit: randomFruit() }
}

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [gameState, setGameState] = useState<GameState>('IDLE')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)

  const [lastFruit, setLastFruit] = useState<Fruit | null>(null)

  const snakeRef = useRef<Point[]>([START])
  const dirRef = useRef<Direction>('RIGHT')
  const nextDirRef = useRef<Direction>('RIGHT')
  const foodRef = useRef<Food>({ x: 5, y: 5, fruit: FRUITS[0] })
  const scoreRef = useRef(0)
  const speedRef = useRef(INITIAL_SPEED)
  const gameLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameStateRef = useRef<GameState>('IDLE')

  // Sync gameState to ref for the game loop
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  // Load high score from localStorage
  useEffect(() => {
    try {
      const saved = localStorage?.getItem?.('snake-high-score')
      if (saved) setHighScore(parseInt(saved, 10) || 0)
    } catch { /* no-op */ }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef?.current
    if (!canvas) return
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return

    // Background
    ctx.fillStyle = '#0d1a0d'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Grid lines
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.06)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= GRID_WIDTH; x++) {
      ctx.beginPath()
      ctx.moveTo(x * CELL_SIZE, 0)
      ctx.lineTo(x * CELL_SIZE, CANVAS_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL_SIZE)
      ctx.lineTo(CANVAS_WIDTH, y * CELL_SIZE)
      ctx.stroke()
    }

    // Fruit with a soft glow behind it
    const food = foodRef.current
    if (food) {
      const cx = food.x * CELL_SIZE + CELL_SIZE / 2
      const cy = food.y * CELL_SIZE + CELL_SIZE / 2
      ctx.shadowColor = food.fruit.glow
      ctx.shadowBlur = 14
      ctx.fillStyle = `${food.fruit.glow}33`
      ctx.beginPath()
      ctx.arc(cx, cy, CELL_SIZE / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.font = `${CELL_SIZE - 2}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(food.fruit.emoji, cx, cy + 1)
    }

    // Snake
    const snake = snakeRef.current ?? []
    snake.forEach((seg: Point, i: number) => {
      if (!seg) return
      const isHead = i === 0
      const progress = 1 - i / Math.max(snake.length, 1)
      const green = Math.floor(140 + progress * 115)
      ctx.shadowColor = isHead ? `rgb(34, ${green}, 94)` : 'transparent'
      ctx.shadowBlur = isHead ? 10 : 0
      ctx.fillStyle = isHead
        ? `rgb(34, ${green}, 94)`
        : `rgba(34, ${green}, 94, ${0.5 + progress * 0.5})`
      const padding = isHead ? 1 : 2
      const radius = isHead ? 5 : 3
      const x = seg.x * CELL_SIZE + padding
      const y = seg.y * CELL_SIZE + padding
      const size = CELL_SIZE - padding * 2
      ctx.beginPath()
      ctx.roundRect(x, y, size, size, radius)
      ctx.fill()
      ctx.shadowBlur = 0
    })
  }, [])

  const gameStep = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return

    // Apply queued direction
    dirRef.current = nextDirRef.current
    const snake = snakeRef.current ?? []
    const head = snake[0]
    if (!head) return

    const dir = dirRef.current
    const newHead: Point = {
      x: head.x + (dir === 'LEFT' ? -1 : dir === 'RIGHT' ? 1 : 0),
      y: head.y + (dir === 'UP' ? -1 : dir === 'DOWN' ? 1 : 0),
    }

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
      endGame()
      return
    }
    // Self collision
    if (snake.some((s: Point) => s?.x === newHead.x && s?.y === newHead.y)) {
      endGame()
      return
    }

    const newSnake = [newHead, ...snake]
    const food = foodRef.current

    if (food && newHead.x === food.x && newHead.y === food.y) {
      // Ate a fruit — score depends on which one
      scoreRef.current += food.fruit.points
      setScore(scoreRef.current)
      setLastFruit(food.fruit)
      foodRef.current = randomFood(newSnake)
      speedRef.current = Math.max(MIN_SPEED, INITIAL_SPEED - (newSnake.length - 1) * SPEED_INCREMENT)
    } else {
      newSnake.pop()
    }

    snakeRef.current = newSnake
    draw()

    gameLoopRef.current = setTimeout(gameStep, speedRef.current)
  }, [draw])

  const endGame = useCallback(() => {
    setGameState('GAME_OVER')
    gameStateRef.current = 'GAME_OVER'
    if (gameLoopRef.current) clearTimeout(gameLoopRef.current)
    const finalScore = scoreRef.current
    setHighScore((prev: number) => {
      const best = Math.max(prev ?? 0, finalScore)
      try { localStorage?.setItem?.('snake-high-score', String(best)) } catch { /* no-op */ }
      return best
    })
  }, [])

  const startGame = useCallback(() => {
    snakeRef.current = [START]
    dirRef.current = 'RIGHT'
    nextDirRef.current = 'RIGHT'
    scoreRef.current = 0
    speedRef.current = INITIAL_SPEED
    foodRef.current = randomFood([START])
    setScore(0)
    setLastFruit(null)
    setGameState('PLAYING')
    gameStateRef.current = 'PLAYING'
    draw()
    if (gameLoopRef.current) clearTimeout(gameLoopRef.current)
    gameLoopRef.current = setTimeout(gameStep, speedRef.current)
  }, [draw, gameStep])

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const key = e?.key?.toLowerCase?.() ?? ''
      const cur = dirRef.current

      if (gameStateRef.current === 'IDLE' || gameStateRef.current === 'GAME_OVER') {
        if (key === 'enter' || key === ' ') {
          e.preventDefault()
          startGame()
          return
        }
      }

      const map: Record<string, Direction> = {
        arrowup: 'UP', arrowdown: 'DOWN', arrowleft: 'LEFT', arrowright: 'RIGHT',
        w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
      }
      const newDir = map[key]
      if (!newDir) return
      e.preventDefault()

      // Prevent 180° reversal
      const opposite: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }
      if (opposite[newDir] === cur) return
      nextDirRef.current = newDir
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [startGame])

  // Draw initial frame
  useEffect(() => {
    draw()
  }, [draw])

  // Cleanup
  useEffect(() => {
    return () => {
      if (gameLoopRef.current) clearTimeout(gameLoopRef.current)
    }
  }, [])

  const currentSpeed = Math.round(((INITIAL_SPEED - speedRef.current) / (INITIAL_SPEED - MIN_SPEED)) * 100)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Snake
        </h1>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-6 px-5 py-2.5 rounded-xl bg-card border border-border" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-mono">SCORE</span>
          <span className="text-lg font-mono font-bold text-primary">{score}</span>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <span className="text-sm text-muted-foreground font-mono">BEST</span>
          <span className="text-lg font-mono font-bold text-yellow-500">{highScore}</span>
        </div>
        {gameState === 'PLAYING' && (
          <>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground font-mono">SPEED</span>
              <span className="text-lg font-mono font-bold text-primary">{currentSpeed}%</span>
            </div>
          </>
        )}
        {gameState === 'PLAYING' && lastFruit && (
          <>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-1.5" title={`Last eaten: ${lastFruit.name}`}>
              <span className="text-lg leading-none">{lastFruit.emoji}</span>
              <span className="text-sm font-mono font-bold text-primary">+{lastFruit.points}</span>
            </div>
          </>
        )}
      </div>

      {/* Canvas container */}
      <div
        className="relative rounded-xl overflow-hidden border-2 border-border"
        style={{
          boxShadow: '0 0 40px rgba(34, 197, 94, 0.1)',
          // Scale down on smaller screens so the whole board stays visible
          width: `min(${CANVAS_WIDTH}px, calc(100vw - 2rem), calc(100vh - 13rem))`,
          minWidth: '280px',
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-full"
        />

        {/* Idle overlay */}
        <AnimatePresence>
          {gameState === 'IDLE' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="text-5xl font-display font-bold text-primary tracking-tight">SNAKE</div>
                <p className="text-muted-foreground text-sm max-w-[300px] text-center">
                  Use arrow keys or WASD to move. Eat fruit to grow. Don&apos;t hit the walls or yourself!
                </p>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 max-w-[340px] text-xs font-mono text-muted-foreground">
                  {FRUITS.map((f) => (
                    <span key={f.name} className="flex items-center gap-1">
                      <span className="text-base leading-none">{f.emoji}</span>{f.points}
                    </span>
                  ))}
                </div>
                <button
                  onClick={startGame}
                  className="flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-lg hover:brightness-110 transition-all duration-fast active:scale-95"
                >
                  <Play className="w-5 h-5" />
                  Play
                </button>
                <span className="text-xs text-muted-foreground">or press Enter / Space</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over overlay */}
        <AnimatePresence>
          {gameState === 'GAME_OVER' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="flex flex-col items-center gap-5"
              >
                <div className="text-4xl font-display font-bold text-destructive tracking-tight">GAME OVER</div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-muted-foreground text-sm">Final Score</span>
                  <span className="text-5xl font-mono font-bold text-primary">{score}</span>
                  {score >= highScore && score > 0 && (
                    <motion.span
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-yellow-500 font-semibold text-sm flex items-center gap-1 mt-1"
                    >
                      <Trophy className="w-4 h-4" /> New High Score!
                    </motion.span>
                  )}
                </div>
                <button
                  onClick={startGame}
                  className="flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-lg hover:brightness-110 transition-all duration-fast active:scale-95"
                >
                  <RotateCcw className="w-5 h-5" />
                  Play Again
                </button>
                <span className="text-xs text-muted-foreground">or press Enter / Space</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile controls */}
      <div className="flex flex-col items-center gap-1 sm:hidden">
        <button
          onTouchStart={(e: React.TouchEvent) => { e.preventDefault(); if (dirRef.current !== 'DOWN') nextDirRef.current = 'UP' }}
          className="w-14 h-14 rounded-lg bg-card border border-border flex items-center justify-center active:bg-primary/20 transition-colors"
        >
          <ArrowUp className="w-6 h-6 text-foreground" />
        </button>
        <div className="flex gap-1">
          <button
            onTouchStart={(e: React.TouchEvent) => { e.preventDefault(); if (dirRef.current !== 'RIGHT') nextDirRef.current = 'LEFT' }}
            className="w-14 h-14 rounded-lg bg-card border border-border flex items-center justify-center active:bg-primary/20 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <button
            onTouchStart={(e: React.TouchEvent) => { e.preventDefault(); if (dirRef.current !== 'UP') nextDirRef.current = 'DOWN' }}
            className="w-14 h-14 rounded-lg bg-card border border-border flex items-center justify-center active:bg-primary/20 transition-colors"
          >
            <ArrowDown className="w-6 h-6 text-foreground" />
          </button>
          <button
            onTouchStart={(e: React.TouchEvent) => { e.preventDefault(); if (dirRef.current !== 'LEFT') nextDirRef.current = 'RIGHT' }}
            className="w-14 h-14 rounded-lg bg-card border border-border flex items-center justify-center active:bg-primary/20 transition-colors"
          >
            <ArrowRight className="w-6 h-6 text-foreground" />
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground hidden sm:block">
        Arrow keys or WASD to move
      </p>
    </div>
  )
}
