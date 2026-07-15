# Task for worker

[Read from: /home/weimou/codehub/bun/pacsviewer/context.md, /home/weimou/codehub/bun/pacsviewer/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Implement device adapter architecture for third-party integration. Create:

1. apps/server/src/adapters/types.ts - Adapter interface definitions:
   - DeviceAdapter interface (initialize, start, stop, receiveImage, queryPatient, queryStudies)
   - AdapterConfig interface
   - AdapterStatus type
   - EventEmitter for events

2. apps/server/src/adapters/registry.ts - Adapter registry and lifecycle management:
   - Register/unregister adapters
   - Start/stop adapters
   - Get adapter status
   - Hot reload support

3. apps/server/src/adapters/base.ts - Base adapter class with common functionality

4. apps/server/src/adapters/dicom.ts - DICOM adapter implementation:
   - C-STORE SCP (receive images)
   - C-FIND SCU (query patient/study)
   - C-MOVE SCU (pull images)
   - Configuration for AE Title, port

5. apps/server/src/adapters/rest.ts - REST API adapter:
   - File upload endpoint
   - Metadata passing
   - Webhook callbacks

6. apps/server/src/routes/adapters.ts - API routes for adapter management

This is for integrating ophthalmic devices like Zeiss OCT, Heidelberg Spectralis, etc.

---
Update progress at: /home/weimou/codehub/bun/pacsviewer/.pi-subagents/artifacts/progress/9a9dd3f0/progress.md

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```