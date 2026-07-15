# Task for worker

[Read from: /home/weimou/codehub/bun/pacsviewer/context.md, /home/weimou/codehub/bun/pacsviewer/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Implement AI image processing capabilities for the PACS Viewer. Create:

1. apps/web/src/lib/ai/tensorflow.ts - TensorFlow.js setup and utilities:
   - Initialize TensorFlow.js with WebGL backend
   - Model loading utilities
   - Inference wrapper

2. apps/web/src/lib/ai/segmentation.ts - Image segmentation:
   - Threshold segmentation (manual/auto)
   - Region growing algorithm
   - Edge-based segmentation
   - Result as mask overlay

3. apps/web/src/lib/ai/detection.ts - Lesion detection:
   - Optic disc/cup segmentation
   - Retinal vessel segmentation
   - Lesion heatmap generation
   - Confidence scoring

4. apps/web/src/components/ai/SegmentationPanel.tsx - UI for segmentation:
   - Threshold slider
   - Region selection
   - Result visualization
   - Export mask

5. apps/web/src/components/ai/DetectionPanel.tsx - UI for detection:
   - Model selection
   - Run detection
   - Show results with confidence
   - Overlay heatmap

6. apps/web/src/stores/aiStore.ts - Zustand store for AI state

Note: Use Canvas API for basic processing, TensorFlow.js for advanced features. Keep models lightweight for browser execution.

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