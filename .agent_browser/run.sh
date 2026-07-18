#!/bin/bash
# run.sh — Agent Browser test runner
#
# Usage:
#   ./run.sh <scenario>     Run a specific scenario
#   ./run.sh smoke          Run all smoke tests
#   ./run.sh all            Run all scenarios
#   ./run.sh --report       Generate HTML report from latest results

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"
REPORTS_DIR="$SCRIPT_DIR/reports"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Generate run ID
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
export RUN_ID

# Log file
LOG_FILE="$REPORTS_DIR/run_${RUN_ID}.log"

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# ─── Variable Substitution ────────────────────────────────────────────────────

# Generate test variables
export TIMESTAMP="$(date +%s)"
export RANDOM_ID="$(printf '%04d' $((RANDOM % 10000)))"
export DATE_TODAY="$(date +%Y-%m-%d)"
export DATE_NOW="$(date +%Y-%m-%dT%H:%M:%S)"
export TEST_MRN="TEST-${TIMESTAMP}-${RANDOM_ID}"
export TEST_NAME="自动化测试患者-${RANDOM_ID}"
export TEST_PHONE="138${RANDOM_ID}0000"
export TEST_EMAIL="test-${RANDOM_ID}@example.com"

# Substitute variables in scenario content
substitute_vars() {
    local content="$1"
    content="${content//\{\{timestamp\}\}/$TIMESTAMP}"
    content="${content//\{\{random\}\}/$RANDOM_ID}"
    content="${content//\{\{date\}\}/$DATE_TODAY}"
    content="${content//\{\{datetime\}\}/$DATE_NOW}"
    content="${content//\{\{mrn\}\}/$TEST_MRN}"
    content="${content//\{\{name\}\}/$TEST_NAME}"
    content="${content//\{\{phone\}\}/$TEST_PHONE}"
    content="${content//\{\{email\}\}/$TEST_EMAIL}"
    echo "$content"
}

# ─── Data Cleanup ─────────────────────────────────────────────────────────────

cleanup_test_data() {
    log "${YELLOW}[cleanup] Cleaning up test data...${NC}"
    
    # Clean up test patients via API
    if command -v curl &> /dev/null; then
        # Delete test patients created during this run
        curl -s -X DELETE "http://localhost:3000/api/test/cleanup?prefix=TEST-" 2>/dev/null || true
    fi
    
    log "${GREEN}[cleanup] Done${NC}"
}

# ─── Scenario Runner ──────────────────────────────────────────────────────────

run_scenario() {
    local scenario_file="$1"
    local scenario_name="$(basename "$scenario_file" .md)"
    
    log ""
    log "${YELLOW}━━━ Running: ${scenario_name} ━━━${NC}"
    
    # Read and substitute variables
    local content
    content=$(cat "$scenario_file")
    content=$(substitute_vars "$content")
    
    # Create temp file with substituted content
    local temp_file="/tmp/scenario_${scenario_name}_${RUN_ID}.md"
    echo "$content" > "$temp_file"
    
    # Run scenario with agent-browser
    local start_time=$(date +%s)
    local result=0
    
    if command -v agent-browser &> /dev/null; then
        agent-browser run "$temp_file" 2>&1 | tee -a "$LOG_FILE" || result=$?
    else
        log "${RED}[error] agent-browser not found${NC}"
        result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Clean up temp file
    rm -f "$temp_file"
    
    # Record result
    if [ $result -eq 0 ]; then
        log "${GREEN}[pass] ${scenario_name} (${duration}s)${NC}"
        echo "PASS" >> "$REPORTS_DIR/results_${RUN_ID}.txt"
    else
        log "${RED}[fail] ${scenario_name} (${duration}s)${NC}"
        echo "FAIL:${scenario_name}" >> "$REPORTS_DIR/results_${RUN_ID}.txt"
        
        # Take failure screenshot
        if command -v agent-browser &> /dev/null; then
            agent-browser screenshot "$REPORTS_DIR/fail_${scenario_name}_${RUN_ID}.png" 2>/dev/null || true
        fi
    fi
    
    return $result
}

# ─── Retry Mechanism ──────────────────────────────────────────────────────────

run_with_retry() {
    local scenario_file="$1"
    local max_retries="${2:-2}"
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        if run_scenario "$scenario_file"; then
            return 0
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            log "${YELLOW}[retry] Attempt $retry/$max_retries...${NC}"
            sleep 2
        fi
    done
    
    return 1
}

# ─── Report Generation ────────────────────────────────────────────────────────

generate_report() {
    local results_file="$REPORTS_DIR/results_${RUN_ID}.txt"
    
    if [ ! -f "$results_file" ]; then
        log "${RED}[error] No results found for run ${RUN_ID}${NC}"
        return 1
    fi
    
    local total=$(wc -l < "$results_file")
    local passed=$(grep -c "PASS" "$results_file" || true)
    local failed=$(grep -c "FAIL" "$results_file" || true)
    
    cat > "$REPORTS_DIR/report_${RUN_ID}.html" << EOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>测试报告 - ${RUN_ID}</title>
    <style>
        body { font-family: -apple-system, sans-serif; margin: 2rem; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1.5rem 0; }
        .stat { padding: 1rem; border-radius: 4px; text-align: center; }
        .stat-total { background: #e3f2fd; color: #1565c0; }
        .stat-pass { background: #e8f5e9; color: #2e7d32; }
        .stat-fail { background: #ffebee; color: #c62828; }
        .stat-number { font-size: 2rem; font-weight: bold; }
        .stat-label { font-size: 0.875rem; opacity: 0.8; }
        .results { margin-top: 1.5rem; }
        .result { padding: 0.75rem; margin: 0.5rem 0; border-radius: 4px; }
        .result-pass { background: #e8f5e9; border-left: 4px solid #2e7d32; }
        .result-fail { background: #ffebee; border-left: 4px solid #c62828; }
        .footer { margin-top: 2rem; text-align: center; color: #666; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 测试报告</h1>
        <p>运行 ID: <code>${RUN_ID}</code></p>
        
        <div class="summary">
            <div class="stat stat-total">
                <div class="stat-number">${total}</div>
                <div class="stat-label">总测试数</div>
            </div>
            <div class="stat stat-pass">
                <div class="stat-number">${passed}</div>
                <div class="stat-label">通过</div>
            </div>
            <div class="stat stat-fail">
                <div class="stat-number">${failed}</div>
                <div class="stat-label">失败</div>
            </div>
        </div>
        
        <div class="results">
            <h2>详细结果</h2>
EOF

    while IFS= read -r line; do
        if [[ "$line" == "PASS" ]]; then
            echo "            <div class=\"result result-pass\">✓ 通过</div>" >> "$REPORTS_DIR/report_${RUN_ID}.html"
        elif [[ "$line" == FAIL:* ]]; then
            local name="${line#FAIL:}"
            echo "            <div class=\"result result-fail\">✗ ${name}</div>" >> "$REPORTS_DIR/report_${RUN_ID}.html"
        fi
    done < "$results_file"

    cat >> "$REPORTS_DIR/report_${RUN_ID}.html" << EOF
        </div>
        
        <div class="footer">
            <p>生成时间: $(date)</p>
            <p>PACS Viewer 自动化测试</p>
        </div>
    </div>
</body>
</html>
EOF

    log "${GREEN}[report] Generated: $REPORTS_DIR/report_${RUN_ID}.html${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
    local command="${1:-}"
    
    # Handle --report flag
    if [ "$command" = "--report" ]; then
        # Find latest run ID
        local latest=$(ls -t "$REPORTS_DIR"/results_*.txt 2>/dev/null | head -1)
        if [ -n "$latest" ]; then
            RUN_ID=$(basename "$latest" | sed 's/results_//;s/.txt//')
            generate_report
        else
            log "${RED}[error] No test results found${NC}"
            exit 1
        fi
        return
    fi
    
    log "${GREEN}━━━ PACS Viewer 测试 ━━━${NC}"
    log "Run ID: ${RUN_ID}"
    log "Time: $(date)"
    log ""
    
    # Clean up before run
    cleanup_test_data
    
    # Initialize results file
    > "$REPORTS_DIR/results_${RUN_ID}.txt"
    
    local failed=0
    
    if [ -z "$command" ] || [ "$command" = "all" ]; then
        # Run all scenarios
        for scenario in "$SCENARIOS_DIR"/*.md; do
            [ -f "$scenario" ] || continue
            run_with_retry "$scenario" || failed=$((failed + 1))
        done
    elif [ "$command" = "smoke" ]; then
        # Run smoke tests only
        for scenario in "$SCENARIOS_DIR"/smoke*.md; do
            [ -f "$scenario" ] || continue
            run_with_retry "$scenario" || failed=$((failed + 1))
        done
    else
        # Run specific scenario
        local scenario_file="$SCENARIOS_DIR/${command}.md"
        if [ -f "$scenario_file" ]; then
            run_with_retry "$scenario_file" || failed=$((failed + 1))
        else
            log "${RED}[error] Scenario not found: ${command}${NC}"
            log "Available scenarios:"
            ls "$SCENARIOS_DIR"/*.md 2>/dev/null | xargs -I{} basename {} .md
            exit 1
        fi
    fi
    
    # Generate report
    generate_report
    
    # Summary
    log ""
    log "${GREEN}━━━ Summary ━━━${NC}"
    local total=$(wc -l < "$REPORTS_DIR/results_${RUN_ID}.txt")
    local passed=$(grep -c "PASS" "$REPORTS_DIR/results_${RUN_ID>.txt" || true)
    log "Total: ${total} | Passed: ${passed} | Failed: ${failed}"
    
    # Cleanup after run
    cleanup_test_data
    
    [ $failed -eq 0 ]
}

main "$@"
