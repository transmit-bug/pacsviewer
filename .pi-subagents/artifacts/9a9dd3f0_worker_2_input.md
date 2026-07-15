# Task for worker

[Read from: /home/weimou/codehub/bun/pacsviewer/context.md, /home/weimou/codehub/bun/pacsviewer/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Implement image comparison functionality for the PACS Viewer. Create:

1. apps/web/src/components/comparison/ComparisonView.tsx - Main comparison component with 3 modes:
   - SideBySide: Left/right or top/bottom split view
   - Overlay: Semi-transparent overlay with opacity slider
   - Slider: Horizontal/vertical slider to reveal images

2. apps/web/src/components/comparison/SideBySideMode.tsx - Side by side comparison with:
   - Synchronized scrolling
   - Synchronized zoom/pan
   - Independent window/level

3. apps/web/src/components/comparison/OverlayMode.tsx - Overlay comparison with:
   - Opacity slider
   - Blend modes (normal, difference, lighten, darken)
   - Diff highlighting

4. apps/web/src/components/comparison/SliderMode.tsx - Slider comparison with:
   - Draggable divider
   - Real-time preview

5. apps/web/src/pages/ComparisonPage.tsx - Page to host comparison view

All modes should work with the existing ImageViewer component.

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