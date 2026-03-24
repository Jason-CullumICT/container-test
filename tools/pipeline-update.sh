#!/usr/bin/env bash
# Pipeline state reporting tool for TheATeam
# Usage:
#   Initialize: bash tools/pipeline-update.sh --team TheATeam --action init --agent team_leader --name "Team Leader" --model sonnet --metrics '{"task_title": "..."}'
#   Update:     bash tools/pipeline-update.sh --team TheATeam --run RUN_ID --agent agent_id --action update --metrics '{...}'
#   Complete:   bash tools/pipeline-update.sh --team TheATeam --run RUN_ID --agent agent_id --action complete --verdict passed --metrics '{...}'
#   Start:      bash tools/pipeline-update.sh --team TheATeam --run RUN_ID --agent agent_id --action start --name "Agent Name" --model sonnet

set -euo pipefail

TEAM=""
RUN_ID=""
AGENT=""
ACTION=""
NAME=""
MODEL=""
VERDICT=""
METRICS="{}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --team) TEAM="$2"; shift 2 ;;
    --run) RUN_ID="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --action) ACTION="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --verdict) VERDICT="$2"; shift 2 ;;
    --metrics) METRICS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

STATE_DIR="tools"
STATE_FILE="${STATE_DIR}/pipeline-state-${TEAM}.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

case "$ACTION" in
  init)
    RUN_ID="run-$(date +%s)-$$"
    cat > "$STATE_FILE" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "team": "${TEAM}",
  "status": "running",
  "started_at": "${TIMESTAMP}",
  "task_title": $(echo "$METRICS" | python3 -c "import sys,json; print(json.dumps(json.loads(sys.stdin.read()).get('task_title','')))" 2>/dev/null || echo '""'),
  "agents": {
    "${AGENT}": {
      "name": "${NAME}",
      "model": "${MODEL}",
      "status": "running",
      "started_at": "${TIMESTAMP}"
    }
  },
  "metrics": ${METRICS}
}
ENDJSON
    echo "$RUN_ID"
    ;;
  start)
    if [ -f "$STATE_FILE" ]; then
      python3 -c "
import json, sys
with open('${STATE_FILE}') as f:
    state = json.load(f)
state.setdefault('agents', {})['${AGENT}'] = {
    'name': '${NAME}',
    'model': '${MODEL}',
    'status': 'running',
    'started_at': '${TIMESTAMP}'
}
with open('${STATE_FILE}', 'w') as f:
    json.dump(state, f, indent=2)
"
    fi
    echo "Agent ${AGENT} started"
    ;;
  update)
    if [ -f "$STATE_FILE" ]; then
      python3 -c "
import json
with open('${STATE_FILE}') as f:
    state = json.load(f)
metrics = json.loads('${METRICS}')
state['metrics'].update(metrics)
state['updated_at'] = '${TIMESTAMP}'
if '${AGENT}' in state.get('agents', {}):
    state['agents']['${AGENT}']['updated_at'] = '${TIMESTAMP}'
with open('${STATE_FILE}', 'w') as f:
    json.dump(state, f, indent=2)
"
    fi
    echo "Pipeline updated"
    ;;
  complete)
    if [ -f "$STATE_FILE" ]; then
      python3 -c "
import json
with open('${STATE_FILE}') as f:
    state = json.load(f)
metrics = json.loads('${METRICS}')
state['metrics'].update(metrics)
state['status'] = 'completed'
state['verdict'] = '${VERDICT}'
state['completed_at'] = '${TIMESTAMP}'
if '${AGENT}' in state.get('agents', {}):
    state['agents']['${AGENT}']['status'] = 'completed'
    state['agents']['${AGENT}']['completed_at'] = '${TIMESTAMP}'
with open('${STATE_FILE}', 'w') as f:
    json.dump(state, f, indent=2)
"
    fi
    echo "Pipeline completed with verdict: ${VERDICT}"
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
