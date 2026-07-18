#!/bin/bash
# trace.sh — Test execution tracer for agent-browser
#
# Records detailed execution traces including:
# - Timestamps
# - Actions performed
# - Screenshots at key points
# - Console errors
# - Network requests
#
# Usage:
#   ./trace.sh start <scenario>    Start tracing
#   ./trace.sh action <desc>       Record an action
#   ./trace.sh check <result>      Record a check result
#   ./trace.sh screenshot [name]   Take a traced screenshot
#   ./trace.sh error <msg>         Record an error
#   ./trace.sh end                 End tracing and generate report

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="$SCRIPT_DIR/reports"
TRACE_DIR="$REPORTS_DIR/traces"

mkdir -p "$TRACE_DIR"

# ─── State ────────────────────────────────────────────────────────────────────

TRACE_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
TRACE_FILE="$TRACE_DIR/trace_${TRACE_ID}.jsonl"
SCENARIO_NAME=""
START_TIME=""

# ─── Helpers ──────────────────────────────────────────────────────────────────

timestamp() {
    date +%Y-%m-%dT%H:%M:%S.%3N
}

elapsed() {
    if [ -z "$START_TIME" ]; then
        echo "0"
        return
    fi
    local start_sec=$(date -d "$START_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$START_TIME" +%s 2>/dev/null || echo "0")
    local now_sec=$(date +%s)
    echo $((now_sec - start_sec))
}

record() {
    local type="$1"
    local data="$2"
    echo "{\"time\":\"$(timestamp)\",\"type\":\"${type}\",\"elapsed\":$(elapsed),${data}}" >> "$TRACE_FILE"
}

# ─── Commands ─────────────────────────────────────────────────────────────────

cmd_start() {
    SCENARIO_NAME="$1"
    START_TIME=$(timestamp)
    
    record "start" "\"scenario\":\"${SCENARIO_NAME}\""
    
    # Take initial screenshot
    local screenshot_path="$TRACE_DIR/${TRACE_ID}_start.png"
    agent-browser screenshot "$screenshot_path" 2>/dev/null || true
    
    echo "Trace started: $SCENARIO_NAME"
}

cmd_action() {
    local description="$1"
    record "action" "\"description\":\"${description}\""
    echo "Action: $description"
}

cmd_check() {
    local result="$1"
    local detail="${2:-}"
    
    if [ "$result" = "pass" ]; then
        record "check" "\"result\":\"pass\",\"detail\":\"${detail}\""
        echo "✓ Check passed: $detail"
    else
        record "check" "\"result\":\"fail\",\"detail\":\"${detail}\""
        echo "✗ Check failed: $detail"
        
        # Take failure screenshot
        local screenshot_path="$TRACE_DIR/${TRACE_ID}_fail_$(date +%s).png"
        agent-browser screenshot "$screenshot_path" 2>/dev/null || true
    fi
}

cmd_screenshot() {
    local name="${1:-$(date +%s)}"
    local screenshot_path="$TRACE_DIR/${TRACE_ID}_${name}.png"
    agent-browser screenshot "$screenshot_path" 2>/dev/null || true
    record "screenshot" "\"path\":\"${screenshot_path}\""
    echo "Screenshot: $screenshot_path"
}

cmd_error() {
    local message="$1"
    record "error" "\"message\":\"${message}\""
    echo "Error: $message"
}

cmd_end() {
    record "end" "\"scenario\":\"${SCENARIO_NAME}\",\"status\":\"complete\""
    
    # Generate summary
    local total_events=$(wc -l < "$TRACE_FILE")
    local errors=$(grep -c '"type":"error"' "$TRACE_FILE" 2>/dev/null || echo "0")
    local checks_fail=$(grep -c '"result":"fail"' "$TRACE_FILE" 2>/dev/null || echo "0")
    
    echo ""
    echo "━━━ Trace Summary ━━━"
    echo "Scenario: $SCENARIO_NAME"
    echo "Total events: $total_events"
    echo "Errors: $errors"
    echo "Failed checks: $checks_fail"
    echo "Trace file: $TRACE_FILE"
    
    # Copy trace to reports with scenario name
    cp "$TRACE_FILE" "$REPORTS_DIR/trace_${SCENARIO_NAME}_${TRACE_ID}.jsonl"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

command="${1:-}"
shift || true

case "$command" in
    start)      cmd_start "$@" ;;
    action)     cmd_action "$@" ;;
    check)      cmd_check "$@" ;;
    screenshot) cmd_screenshot "$@" ;;
    error)      cmd_error "$@" ;;
    end)        cmd_end "$@" ;;
    *)
        echo "Usage: $0 <command> [args...]"
        echo ""
        echo "Commands:"
        echo "  start <scenario>      Start tracing"
        echo "  action <desc>         Record an action"
        echo "  check <pass|fail> [detail] Record a check"
        echo "  screenshot [name]     Take a screenshot"
        echo "  error <msg>           Record an error"
        echo "  end                   End tracing"
        exit 1
        ;;
esac
