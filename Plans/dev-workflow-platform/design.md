# Design: Development Workflow Platform

## Approach

Full-stack TypeScript application with a React frontend and Express backend, using SQLite for persistence. The system models a development lifecycle pipeline with 7 subsystems.

## Architecture

```
Source/
  Shared/          # TypeScript interfaces shared between frontend and backend
    types.ts       # All domain entity types
    api.ts         # API request/response types
  Backend/
    src/
      index.ts         # Express app entry point
      database/
        schema.ts      # SQLite schema and migrations
        connection.ts  # Database connection
      services/        # Business logic layer
        featureRequestService.ts
        bugService.ts
        cycleService.ts
        votingService.ts
        dashboardService.ts
        learningService.ts
        featureService.ts
      routes/          # Express route handlers
        featureRequests.ts
        bugs.ts
        cycles.ts
        dashboard.ts
        learnings.ts
        features.ts
      middleware/
        logging.ts     # Structured JSON logging
        metrics.ts     # Prometheus metrics
        errorHandler.ts
      lib/
        logger.ts      # Logger abstraction
    tests/             # Vitest test files
    package.json
    tsconfig.json
  Frontend/
    src/
      App.tsx
      main.tsx
      api/             # API client functions
        client.ts
      components/
        layout/        # Sidebar, header
        dashboard/     # Dashboard widgets
        feature-requests/  # FR list, form, voting display
        bugs/          # Bug list, form
        cycles/        # Cycle view, ticket board
        approvals/     # Approval queue
        features/      # Feature browser
        learnings/     # Learnings list
      pages/           # Page-level components
      hooks/           # Custom React hooks
    tests/
    package.json
    tsconfig.json
    vite.config.ts
    tailwind.config.js
```

## Trade-offs

1. **SQLite vs Postgres**: Chose SQLite for zero-config setup. Sufficient for v1, can migrate later.
2. **Simulated integrations**: Zendesk, competitor analysis, code review sources are simulated — FRs can be created with a source tag but no real integrations in v1.
3. **AI voting simulation**: Voting is simulated with randomized agent opinions + generated comments, not real LLM calls.
4. **Single active cycle**: Only one development cycle runs at a time for simplicity.
5. **CI/CD simulation**: Deployment is a status change, not a real pipeline trigger.

## Key Design Decisions

- **Service layer pattern**: All business logic in services, routes are thin HTTP handlers
- **Shared types**: Single source of truth for entity types in Source/Shared/
- **Ticket state machine**: Tickets follow a strict state progression within the implementation loop
- **Priority queue**: Bugs always sort above FRs; within each, ordered by severity/priority
