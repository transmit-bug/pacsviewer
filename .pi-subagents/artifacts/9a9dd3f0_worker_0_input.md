# Task for worker

[Read from: /home/weimou/codehub/bun/pacsviewer/context.md, /home/weimou/codehub/bun/pacsviewer/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Implement measurement and annotation tools for the PACS Viewer. Create the following components in apps/web/src/components/editor/:

1. MeasurementTools.tsx - Length, angle, area measurement tools with:
   - LengthTool: Draw line segment, show distance in mm/px
   - AngleTool: Draw two lines, show angle in degrees
   - AreaTool: Draw rectangle/ellipse/polygon, show area
   - ProbeTool: Click to show pixel value at point

2. AnnotationTools.tsx - Annotation tools:
   - ArrowTool: Draw arrow with text label
   - TextTool: Add text annotation at position
   - FreehandTool: Freehand drawing with adjustable brush size
   - ROITool: Region of Interest (rectangle, ellipse, polygon)

3. AnnotationLayer.tsx - Canvas overlay for rendering all annotations
4. MeasurementDisplay.tsx - Display measurement results in a panel

All tools should use canvas for rendering and integrate with the viewerStore.

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