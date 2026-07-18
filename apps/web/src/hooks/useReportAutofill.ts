/**
 * useReportAutofill Hook
 *
 * Automatically fills report template fields from study measurements/annotations.
 * Maps annotation labels to template field keys.
 */

import { useState, useEffect } from 'react';
import { annotationApi } from '@/services/api';

interface AutofillOptions {
  studyId: string;
  templateType: string;
}

interface Annotation {
  id: string;
  label?: string;
  type: string;
  geometry?: any;
}

/**
 * Common label-to-key mappings for ophthalmology measurements.
 * Maps Chinese/English annotation labels to template field keys.
 */
const LABEL_TO_KEY_MAP: Record<string, Record<string, string>> = {
  oct: {
    '中心凹厚度': 'centralThickness',
    '黄斑中心凹厚度': 'centralThickness',
    '中心凹': 'centralThickness',
    '平均厚度': 'averageThickness',
    'RNFL 平均': 'rnflAverage',
    'RNFL 均厚': 'rnflAverage',
    'RNFL 上方': 'rnflSuperior',
    'RNFL 下方': 'rnflInferior',
    'RNFL 鼻侧': 'rnflNasal',
    'RNFL 颞侧': 'rnflTemporal',
    '上方 RNFL': 'rnflSuperior',
    '下方 RNFL': 'rnflInferior',
    '鼻侧 RNFL': 'rnflNasal',
    '颞侧 RNFL': 'rnflTemporal',
  },
  fundus: {
    'C/D 水平': 'cdRatioHorizontal',
    'C/D 垂直': 'cdRatioVertical',
    '水平 C/D': 'cdRatioHorizontal',
    '垂直 C/D': 'cdRatioVertical',
    '视盘 C/D': 'cdRatioHorizontal',
  },
  vf: {
    'MD': 'md',
    'PSD': 'psd',
    'VFI': 'vfi',
    '平均缺损': 'md',
    '模式标准差': 'psd',
    '视野指数': 'vfi',
  },
  glaucoma: {
    '眼压': 'iop',
    'IOP': 'iop',
    'RNFL 均厚': 'rnflAverage',
    '平均 RNFL': 'rnflAverage',
    'C/D 比': 'cdRatio',
    'MD': 'md',
    'PSD': 'psd',
  },
  cataract: {
    'K1': 'k1',
    'K2': 'k2',
    '角膜曲率 K1': 'k1',
    '角膜曲率 K2': 'k2',
    '前房深度': 'acd',
    'ACD': 'acd',
    '眼轴': 'al',
    '眼轴长度': 'al',
    'AL': 'al',
    '晶状体厚度': 'lt',
    'LT': 'lt',
  },
  refractive: {
    '角膜厚度': 'cornealThickness',
    '最薄点': 'thinnestPoint',
    'K1': 'k1',
    'K2': 'k2',
    '瞳孔直径': 'pupilDiameter',
    '等效球镜': 'sphericalEquivalent',
  },
};

/**
 * Extract numeric value from annotation geometry.
 */
function extractValue(annotation: Annotation): number | undefined {
  const geometry = annotation.geometry;
  if (!geometry) return undefined;

  // Direct value
  if (typeof geometry.value === 'number') return geometry.value;

  // Measurement result
  if (geometry.result?.value !== undefined) return geometry.result.value;

  // Distance measurement
  if (geometry.distance !== undefined) return geometry.distance;

  // Area measurement
  if (geometry.area !== undefined) return geometry.area;

  return undefined;
}

/**
 * Map annotation labels to template field keys.
 */
function mapAnnotationsToFields(
  annotations: Annotation[],
  templateType: string
): Record<string, any> {
  const mappings = LABEL_TO_KEY_MAP[templateType] || {};
  const result: Record<string, any> = {};

  for (const annotation of annotations) {
    if (annotation.type !== 'measurement') continue;

    const label = annotation.label || '';
    const value = extractValue(annotation);

    if (value === undefined) continue;

    // Try exact match first
    if (mappings[label]) {
      result[mappings[label]] = value;
      continue;
    }

    // Try partial match
    for (const [pattern, key] of Object.entries(mappings)) {
      if (label.includes(pattern) || pattern.includes(label)) {
        result[key] = value;
        break;
      }
    }
  }

  return result;
}

/**
 * Hook to auto-fill report fields from study measurements.
 */
export function useReportAutofill({ studyId, templateType }: AutofillOptions) {
  const [autoFillData, setAutoFillData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studyId || !templateType) return;

    const fetchMeasurements = async () => {
      setIsLoading(true);
      try {
        // Fetch annotations for the study
        const response = await annotationApi.list({ studyId });
        const annotations = (response.data || []) as Annotation[];

        // Map annotations to template fields
        const mapped = mapAnnotationsToFields(annotations, templateType);
        setAutoFillData(mapped);
      } catch (err) {
        console.error('Failed to fetch measurements for auto-fill:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeasurements();
  }, [studyId, templateType]);

  return { autoFillData, isLoading };
}
