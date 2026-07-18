#!/bin/bash
# check.sh — Verification point checker for agent-browser scenarios
#
# Usage:
#   ./check.sh <check_type> [args...]
#
# Check types:
#   url <expected>         Check current URL matches pattern
#   text <selector> <text> Check element contains text
#   visible <selector>     Check element is visible
#   hidden <selector>      Check element is hidden
#   count <selector> <n>   Check element count equals n
#   value <selector> <val> Check input value
#   title <expected>       Check page title
#   screenshot <path>      Take screenshot (always passes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="$SCRIPT_DIR/reports"
CHECK_LOG="${REPORTS_DIR}/checks_${RUN_ID:-$(date +%Y%m%d_%H%M%S)}.log"

mkdir -p "$REPORTS_DIR"

log() {
    echo "$(date +%H:%M:%S) $1" >> "$CHECK_LOG"
    echo "$1"
}

pass() {
    log "✓ PASS: $1"
    echo "PASS" >> "$CHECK_LOG"
    exit 0
}

fail() {
    log "✗ FAIL: $1"
    echo "FAIL:$1" >> "$CHECK_LOG"
    exit 1
}

check_url() {
    local expected="$1"
    local actual
    actual=$(agent-browser get-url 2>/dev/null || echo "")
    
    if [[ "$actual" == *"$expected"* ]]; then
        pass "URL contains '$expected'"
    else
        fail "URL mismatch: expected='$expected' actual='$actual'"
    fi
}

check_text() {
    local selector="$1"
    local expected="$2"
    local actual
    actual=$(agent-browser get-text "$selector" 2>/dev/null || echo "")
    
    if [[ "$actual" == *"$expected"* ]]; then
        pass "Text '$expected' found in $selector"
    else
        fail "Text mismatch in $selector: expected='$expected' actual='$actual'"
    fi
}

check_visible() {
    local selector="$1"
    local visible
    visible=$(agent-browser is-visible "$selector" 2>/dev/null || echo "false")
    
    if [ "$visible" = "true" ]; then
        pass "Element visible: $selector"
    else
        fail "Element not visible: $selector"
    fi
}

check_hidden() {
    local selector="$1"
    local visible
    visible=$(agent-browser is-visible "$selector" 2>/dev/null || echo "true")
    
    if [ "$visible" = "false" ]; then
        pass "Element hidden: $selector"
    else
        fail "Element not hidden: $selector"
    fi
}

check_count() {
    local selector="$1"
    local expected="$2"
    local actual
    actual=$(agent-browser count "$selector" 2>/dev/null || echo "0")
    
    if [ "$actual" = "$expected" ]; then
        pass "Count matches: $selector = $expected"
    else
        fail "Count mismatch: $selector expected=$expected actual=$actual"
    fi
}

check_value() {
    local selector="$1"
    local expected="$2"
    local actual
    actual=$(agent-browser get-value "$selector" 2>/dev/null || echo "")
    
    if [[ "$actual" == *"$expected"* ]]; then
        pass "Value '$expected' found in $selector"
    else
        fail "Value mismatch in $selector: expected='$expected' actual='$actual'"
    fi
}

check_title() {
    local expected="$1"
    local actual
    actual=$(agent-browser get-title 2>/dev/null || echo "")
    
    if [[ "$actual" == *"$expected"* ]]; then
        pass "Title contains '$expected'"
    else
        fail "Title mismatch: expected='$expected' actual='$actual'"
    fi
}

check_screenshot() {
    local path="$1"
    agent-browser screenshot "$path" 2>/dev/null
    pass "Screenshot saved: $path"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

check_type="${1:-}"
shift || true

case "$check_type" in
    url)       check_url "$@" ;;
    text)      check_text "$@" ;;
    visible)   check_visible "$@" ;;
    hidden)    check_hidden "$@" ;;
    count)     check_count "$@" ;;
    value)     check_value "$@" ;;
    title)     check_title "$@" ;;
    screenshot) check_screenshot "$@" ;;
    *)
        echo "Usage: $0 <check_type> [args...]"
        echo ""
        echo "Check types:"
        echo "  url <expected>         Check URL contains pattern"
        echo "  text <sel> <text>      Check element text"
        echo "  visible <sel>          Check element visible"
        echo "  hidden <sel>           Check element hidden"
        echo "  count <sel> <n>        Check element count"
        echo "  value <sel> <val>      Check input value"
        echo "  title <expected>       Check page title"
        echo "  screenshot <path>      Take screenshot"
        exit 1
        ;;
esac
