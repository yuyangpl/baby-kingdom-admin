#!/bin/bash
# Baby Kingdom Admin - Dev Services Launcher
# Starts Cloud SQL Proxy, backend, and frontend in one go
# Usage: ./dev.sh [start|stop|restart|logs]

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/.dev-logs"
PID_FILE="$LOG_DIR/pids"

# Cloud SQL 配置
CLOUD_SQL_INSTANCE="sugar-379907:us-central1:sugar-dev-test"
CLOUD_SQL_PORT=5433

mkdir -p "$LOG_DIR"

start_services() {
  if [ -f "$PID_FILE" ]; then
    echo "Services may already be running. Use './dev.sh stop' first or './dev.sh restart'."
    exit 1
  fi

  echo "Starting Baby Kingdom dev services..."

  # Cloud SQL Proxy (port 5433)
  cloud-sql-proxy "$CLOUD_SQL_INSTANCE" --port "$CLOUD_SQL_PORT" --gcloud-auth > "$LOG_DIR/proxy.log" 2>&1 &
  PROXY_PID=$!
  echo "  Proxy    (PID $PROXY_PID) -> localhost:$CLOUD_SQL_PORT"
  sleep 2

  # Check proxy started
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "  ERROR: Cloud SQL Proxy failed to start. Check .dev-logs/proxy.log"
    exit 1
  fi

  # Backend API (port 3000)
  cd "$PROJECT_DIR/backend"
  npm run dev > "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "  Backend  (PID $BACKEND_PID) -> http://localhost:3000"

  # Frontend (port 5173)
  cd "$PROJECT_DIR/frontend"
  npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  echo "  Frontend (PID $FRONTEND_PID) -> http://localhost:5173"

  # Save PIDs
  echo "$PROXY_PID $BACKEND_PID $FRONTEND_PID" > "$PID_FILE"

  echo ""
  echo "All services started. Logs in .dev-logs/"
  echo "  tail -f .dev-logs/proxy.log"
  echo "  tail -f .dev-logs/backend.log"
  echo "  tail -f .dev-logs/frontend.log"
  echo ""
  echo "Stop with: ./dev.sh stop"
}

stop_services() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found. Trying to kill by port..."
    for port in $CLOUD_SQL_PORT 3000 5173; do
      pids=$(lsof -ti :$port 2>/dev/null)
      if [ -n "$pids" ]; then
        echo "  Killing processes on port $port: $pids"
        echo "$pids" | xargs kill 2>/dev/null
      fi
    done
    echo "Done."
    return
  fi

  read -r PROXY_PID BACKEND_PID FRONTEND_PID < "$PID_FILE"

  echo "Stopping services..."
  for pid in $PROXY_PID $BACKEND_PID $FRONTEND_PID; do
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
    tail -f "$LOG_DIR/proxy.log" "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
    ;;
  *)
    echo "Usage: ./dev.sh [start|stop|restart|logs]"
    exit 1
    ;;
esac
