# Prompt: Orchestrator Cycle Dashboard

Replace the Dev Cycle page with a real-time orchestrator cycle dashboard. The frontend API client already has orchestrator.listCycles(), orchestrator.getCycle(id), orchestrator.stopCycle(id), and orchestrator.submitWork(task) functions at Source/Frontend/src/api/client.ts. Build NEW React components that USE these functions:

1. **OrchestratorCyclesPage** that replaces DevelopmentCyclePage - polls orchestrator.listCycles() every 5 seconds, displays active cycles in cards with team badge, current phase, progress bar, and port links.
2. **CycleLogStream** component that connects to /api/orchestrator/api/cycles/:id/logs SSE endpoint and renders agent activity in real-time.
3. Each cycle card has a clickable app link, a stop button, and shows elapsed time.
4. Completed cycles in a collapsible section below.
5. Update App.tsx route and sidebar.

The backend already has the orchestrator proxy at /api/orchestrator/* - do not modify the backend.
