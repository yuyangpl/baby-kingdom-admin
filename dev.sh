#!/bin/bash
# Baby Kingdom Admin - Dev Services Launcher
# Starts backend, worker, and frontend in one go
# Usage: ./dev.sh [start|stop|restart]

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/.dev-logs"
PID_FILE="$LOG_DIR/pids"

mkdir -p "$LOG_DIR"

start_services() {
  # Check if already running
  if [ -f "$PID_FILE" ]; then
    echo "Services may already be running. Use './dev.sh stop' first or './dev.sh restart'."
    exit 1
  fi

  echo "Starting Baby Kingdom dev services..."

  # Backend API (port 3000)
  cd "$PROJECT_DIR/backend"
  npm run dev > "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "  Backend  (PID $BACKEND_PID) -> http://localhost:3000"

  # Worker (BullMQ processors + cron)
  npm run worker > "$LOG_DIR/worker.log" 2>&1 &
  WORKER_PID=$!
  echo "  Worker   (PID $WORKER_PID)"

  # Frontend (port 5173)
  cd "$PROJECT_DIR/frontend"
  npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  echo "  Frontend (PID $FRONTEND_PID) -> http://localhost:5173"

  # Save PIDs
  echo "$BACKEND_PID $WORKER_PID $FRONTEND_PID" > "$PID_FILE"

  echo ""
  echo "All services started. Logs in .dev-logs/"
  echo "  tail -f .dev-logs/backend.log"
  echo "  tail -f .dev-logs/worker.log"
  echo "  tail -f .dev-logs/frontend.log"
  echo ""
  echo "Stop with: ./dev.sh stop"
}

stop_services() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found. Trying to kill by port..."
    # Fallback: kill by port
    for port in 3000 5173; do
      pids=$(lsof -ti :$port 2>/dev/null)
      if [ -n "$pids" ]; then
        echo "  Killing processes on port $port: $pids"
        echo "$pids" | xargs kill 2>/dev/null
      fi
    done
    echo "Done."
    return
  fi

  read -r BACKEND_PID WORKER_PID FRONTEND_PID < "$PID_FILE"

  echo "Stopping services..."
  for pid in $BACKEND_PID $WORKER_PID $FRONTEND_PID; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "  Killed PID $pid"
    fi
  done

  rm -f "$PID_FILE"
  echo "All services stopped."
}

case "${1:-start}" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    stop_services
    sleep 1
    start_services
    ;;
  logs)
    # Show all logs interleaved
    tail -f "$LOG_DIR/backend.log" "$LOG_DIR/worker.log" "$LOG_DIR/frontend.log"
    ;;
  *)
    echo "Usage: ./dev.sh [start|stop|restart|logs]"
    exit 1
    ;;
esac
