/**
 * Preset measurement definitions — controlled dictionary for longitudinal
 * measurement snapshots (wayfinder #87 / ticket T2).
 *
 * `trendDirection` fixes which direction is *worse*:
 *   - 'down': decreasing value is worsening (RNFL thickness, fovea thickness)
 *   - 'up':   increasing value is worsening (C/D ratio, IOP)
 * `referenceRange` ({ min?, max? }) drives the normal-range band in the trend
 * chart. Units are the display/recorded units used by Cornerstone on
 * calibrated images.
 */
import { eq } from 'drizzle-orm';
import { db, measurementDefinitions } from './index';
import { v4 as uuid } from 'uuid';

export interface MeasurementDefinitionRow {
  key: string;
  displayName: string;
  type: string;
  unit: string;
  trendDirection: 'up' | 'down';
  referenceRange: { min?: number; max?: number } | null;
  modality: string | null;
}
export interface PresetMeasurementDefinition {
  key: string;
  displayName: string;
  type: string;
  unit: string;
  trendDirection: 'up' | 'down';
  referenceRange: { min?: number; max?: number } | null;
  modality?: string;
  description?: string;
}

export const PRESET_MEASUREMENT_DEFINITIONS: PresetMeasurementDefinition[] = [
  {
    key: 'rnfl',
    displayName: 'RNFL 厚度',
    type: 'thickness',
    unit: 'μm',
    trendDirection: 'down',
    referenceRange: { min: 80 },
    modality: 'OCT',
    description: '视盘周围视网膜神经纤维层平均厚度,低于 80μm 提示进展性损伤',
  },
  {
    key: 'fovea',
    displayName: '黄斑中心凹厚度',
    type: 'thickness',
    unit: 'μm',
    trendDirection: 'down',
    referenceRange: { min: 200 },
    modality: 'OCT',
    description: '黄斑中心凹 1mm 范围内视网膜厚度',
  },
  {
    key: 'gcl',
    displayName: '神经节细胞层复合体厚度',
    type: 'thickness',
    unit: 'μm',
    trendDirection: 'down',
    referenceRange: { min: 70 },
    modality: 'OCT',
    description: '神经节细胞层+内丛状层复合体厚度',
  },
  {
    key: 'cd',
    displayName: 'C/D 比',
    type: 'ratio',
    unit: '',
    trendDirection: 'up',
    referenceRange: { max: 0.5 },
    modality: 'Fundus',
    description: '视杯视盘比,超过 0.5 提示青光眼性视神经损伤',
  },
  {
    key: 'iop',
    displayName: '眼压',
    type: 'pressure',
    unit: 'mmHg',
    trendDirection: 'up',
    referenceRange: { min: 10, max: 21 },
    modality: 'Fundus',
    description: '眼内压,正常 10–21 mmHg',
  },
  {
    key: 'axial_length',
    displayName: '眼轴长度',
    type: 'distance',
    unit: 'mm',
    trendDirection: 'up',
    referenceRange: { min: 22, max: 26 },
    modality: 'Biometry',
    description: '眼轴长度,超过 26mm 提示轴性近视进展',
  },
  {
    key: 'disc_area',
    displayName: '视盘面积',
    type: 'area',
    unit: 'mm²',
    trendDirection: 'down',
    referenceRange: null,
    modality: 'Fundus',
    description: '视盘总盘面积',
  },
  {
    key: 'md',
    displayName: '视野平均偏差 MD',
    type: 'other',
    unit: 'dB',
    trendDirection: 'down',
    referenceRange: { min: -2 },
    modality: 'VF',
    description: 'Humphrey 视野平均偏差,低于 -2dB 提示弥漫性视野缺损',
  },
  {
    key: 'psd',
    displayName: '视野模式标准差 PSD',
    type: 'other',
    unit: 'dB',
    trendDirection: 'up',
    referenceRange: { max: 2 },
    modality: 'VF',
    description: '视野局部缺损程度,超过 2dB 提示局部视野缺损',
  },
];

/**
 * Idempotently upsert the preset definitions into the dictionary.
 * Called on server startup paths (lazy on first dictionary read) and by the
 * seed script. Presets keep their identity by `key`; display fields are
 * refreshed to match this module.
 */
export async function ensurePresetDefinitions(): Promise<void> {
  const now = new Date().toISOString();
  for (const preset of PRESET_MEASUREMENT_DEFINITIONS) {
    const existing = await db.query.measurementDefinitions.findFirst({
      where: eq(measurementDefinitions.key, preset.key),
    });
    const values = {
      displayName: preset.displayName,
      type: preset.type,
      unit: preset.unit,
      trendDirection: preset.trendDirection,
      referenceRange: preset.referenceRange,
      modality: preset.modality ?? null,
      description: preset.description ?? null,
      isPreset: true,
      updatedAt: now,
    };
    if (existing) {
      await db.update(measurementDefinitions).set(values).where(eq(measurementDefinitions.key, preset.key));
    } else {
      await db.insert(measurementDefinitions).values({
        id: uuid(),
        key: preset.key,
        ...values,
        createdAt: now,
      });
    }
  }
}

/** Load the full dictionary keyed by `key` (for extraction lookups). */
export async function getDefinitionMap(): Promise<Record<string, MeasurementDefinitionRow>> {
  await ensurePresetDefinitions();
  const rows = await db
    .select({
      key: measurementDefinitions.key,
      displayName: measurementDefinitions.displayName,
      type: measurementDefinitions.type,
      unit: measurementDefinitions.unit,
      trendDirection: measurementDefinitions.trendDirection,
      referenceRange: measurementDefinitions.referenceRange,
      modality: measurementDefinitions.modality,
    })
    .from(measurementDefinitions)
    .orderBy(measurementDefinitions.key);
  const map: Record<string, MeasurementDefinitionRow> = {};
  for (const row of rows) {
    map[row.key] = {
      ...row,
      referenceRange: row.referenceRange as MeasurementDefinitionRow['referenceRange'],
    };
  }
  return map;
}

