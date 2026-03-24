# Pipeline Tools

## pipeline-update.sh

Reports pipeline state for agent team coordination.

### Usage

```bash
# Initialize a new pipeline run
RUN_ID=$(bash tools/pipeline-update.sh --team TheATeam --action init \
  --agent team_leader --name "Team Leader" --model sonnet \
  --metrics '{"task_title": "My Task"}')

# Agent starts work
bash tools/pipeline-update.sh --team TheATeam --run "$RUN_ID" \
  --agent backend_coder --action start --name "Backend Coder" --model sonnet

# Update progress
bash tools/pipeline-update.sh --team TheATeam --run "$RUN_ID" \
  --agent team_leader --action update \
  --metrics '{"current_stage": 2, "stages_total": 4}'

# Complete
bash tools/pipeline-update.sh --team TheATeam --run "$RUN_ID" \
  --agent team_leader --action complete --verdict passed \
  --metrics '{"current_stage": 4, "stages_total": 4}'
```

### State File

State is written to `tools/pipeline-state-{team}.json`.
