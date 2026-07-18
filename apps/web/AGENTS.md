# apps/web — Frontend SPA

## Architecture

```
pages/          Route-level components (one per page)
components/     Reusable UI
  ui/           shadcn/ui primitives (do NOT edit directly — use `npx shadcn add`)
  viewer/       Medical image viewer components (Cornerstone.js based)
  layout/       App shell (sidebar, header)
  auth/         ProtectedRoute wrapper
  patient/      Patient-specific components
  report/       Report editor components
  comparison/   Side-by-side image comparison
  upload/       File upload components
  editor/       Image annotation editor
  ai/           AI detection/segmentation overlays
stores/         Zustand stores (one per domain)
services/       API layer — single `api.ts` file with all endpoints
hooks/          Custom React hooks
lib/            Domain-specific libraries
  cornerstone/  Cornerstone.js init, codec shim, annotation sync
  ai/           TensorFlow.js inference (detection, segmentation)
  cache/        IndexedDB cache layer
  utils.ts      Tailwind `cn()` merge helper
workers/        Web Workers (DICOM decode, image processing)
i18n/           i18next — zh (default) + en
```

## Data Flow

```
Component → store action → services/api.ts → axios → /api/*
                                                  ↑
                                    interceptor injects auth token
                                    interceptor auto-refreshes on 401
```

- **API responses**: interceptor unwraps `response.data` — callers receive the JSON body directly, not the Axios wrapper.
- **Auth token**: read from `useAuthStore.getState().token` (not from localStorage directly).
- **401 refresh**: interceptor catches 401, calls `/api/auth/refresh`, retries the original request. On failure, redirects to `/login`.

## Stores Pattern

Each Zustand store is a standalone module in `stores/`. Key conventions:

- **authStore**: uses `persist` middleware with `localStorage`. Has `isHydrated` flag — check this before rendering auth-dependent UI.
- **viewerStore**: manages Cornerstone viewport state (zoom, pan, window/level, annotations, layers, multi-frame playback). DICOM metadata is stored as `DicomImageMetadata` for measurement calibration.
- **Other stores**: plain `create()` — no persistence.

## Cornerstone.js Integration

Medical image rendering lives in `lib/cornerstone/`:

- `init.ts` — singleton initialization of `@cornerstonejs/core` + `@cornerstonejs/tools`. Call `initCornerstone()` before using any viewport.
- `annotation-sync.ts` — bidirectional sync between Cornerstone tools and the backend annotation API.
- `codec-shim.ts` / `codec-wrapper.js` — DICOM codec loading shim for web workers.
- `CornerstoneViewport` component wraps the rendering engine — pass `imageId` and `imageFormat`.

**Tool mapping**: `viewerStore.activeTool` uses internal names (`pan`, `zoom`, `windowLevel`, `length`, etc.) which are mapped to Cornerstone tool classes in `CornerstoneViewport`.

## Multi-Modal Viewer

`components/viewer/` contains modality-specific viewers:

| Component | Modality |
|-----------|----------|
| `OctViewer` | OCT B-scans with en-face preview |
| `FfaTimeline` | FFA/ICGA timeline with phase annotations |
| `VisualFieldViewer` | Perimetry grayscale/deviation maps |
| `CornealTopography` | Corneal elevation maps |
| `ImageViewer` | Generic fundus/photo viewer |

`useOctNavigation` hook provides OCT-specific frame navigation with DICOM frame metadata from the server.

## AI Integration

`lib/ai/` runs TensorFlow.js models in-browser:

- `detection.ts` — lesion/feature detection
- `segmentation.ts` — region segmentation
- `tensorflow.ts` — model loading and inference helpers

AI results are rendered as overlays in `components/ai/`.

## i18n

- Default language: **zh** (Chinese)
- Fallback: `zh` — all keys must exist in `zh.json`
- Usage: `useTranslation()` hook or `t('key')` function

## Adding a New Page

1. Create component in `pages/YourPage.tsx`
2. Add route in `App.tsx` inside the `<Route path="/" element={<ProtectedRoute>...}>` block
3. If it needs state, create a store in `stores/`
4. Add API functions to `services/api.ts`

## Gotcha

- **shadcn/ui components in `components/ui/`** are generated — do not hand-edit. Use `npx shadcn add <component>` to update.
- **`api.ts` response unwrap**: the axios response interceptor returns `response.data`, so `const data = await patientApi.getAll()` gives you the JSON body, not `{ data, status, headers }`.
- **Cornerstone init**: must call `initCornerstone()` before creating any viewport. The `CornerstoneViewport` component handles this internally, but custom usage needs explicit init.
- **authStore hydration**: `isHydrated` starts `false` — the `ProtectedRoute` component waits for hydration before redirect decisions.
