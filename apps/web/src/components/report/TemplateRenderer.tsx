/**
 * Report Template Renderer
 *
 * Renders ophthalmology-specific report templates with support for:
 * - Structured fields (text, number, select, textarea)
 * - Measurement fields with auto-fill from annotations
 * - Image fields for screenshots
 * - Automatic normal range comparison
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'image' | 'measurement' | 'table' | 'image[]';
  required?: boolean;
  section?: string;
  options?: string[];
  unit?: string;
  normalRange?: [number, number];
  autoFill?: string;
  source?: 'manual' | 'measurement' | 'ai';
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  fields: ReportField[];
  layout?: {
    columns?: number;
    sections?: string[];
  };
}

interface TemplateRendererProps {
  template: ReportTemplate;
  studyId?: string;
  values?: Record<string, any>;
  onChange?: (values: Record<string, any>) => void;
  readOnly?: boolean;
  autoFillData?: Record<string, any>;
}

// ─── Template Renderer Component ─────────────────────────────────────────────

export function TemplateRenderer({
  template,
  values = {},
  onChange,
  readOnly = false,
  autoFillData = {},
}: TemplateRendererProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>(values);

  // Merge auto-fill data with form values
  useEffect(() => {
    if (Object.keys(autoFillData).length > 0) {
      const merged = { ...formValues };
      for (const field of template.fields) {
        if (field.autoFill && autoFillData[field.autoFill] !== undefined) {
          merged[field.key] = autoFillData[field.autoFill];
        }
      }
      setFormValues(merged);
      onChange?.(merged);
    }
  }, [autoFillData]);

  const handleChange = (key: string, value: any) => {
    const updated = { ...formValues, [key]: value };
    setFormValues(updated);
    onChange?.(updated);
  };

  // Group fields by section
  const sections = useMemo(() => {
    const grouped: Record<string, ReportField[]> = {};
    for (const field of template.fields) {
      const section = field.section || '默认';
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    }
    return grouped;
  }, [template.fields]);

  const sectionOrder = template.layout?.sections || Object.keys(sections);
  const columns = template.layout?.columns || 1;

  return (
    <div className="space-y-6">
      {sectionOrder.map((sectionName) => {
        const fields = sections[sectionName];
        if (!fields || fields.length === 0) return null;

        return (
          <Card key={sectionName}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
              >
                {fields.map((field) => (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    value={formValues[field.key]}
                    onChange={(value) => handleChange(field.key, value)}
                    readOnly={readOnly}
                    isAutoFilled={!!(field.autoFill && autoFillData[field.autoFill] !== undefined)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Field Renderer Component ────────────────────────────────────────────────

interface FieldRendererProps {
  field: ReportField;
  value: any;
  onChange: (value: any) => void;
  readOnly?: boolean;
  isAutoFilled?: boolean;
}

function FieldRenderer({ field, value, onChange, readOnly, isAutoFilled }: FieldRendererProps) {
  const isOutOfRange = field.normalRange && value !== undefined && value !== '';
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  const isBelow = isOutOfRange && !isNaN(numValue) && numValue < (field.normalRange?.[0] ?? -Infinity);
  const isAbove = isOutOfRange && !isNaN(numValue) && numValue > (field.normalRange?.[1] ?? Infinity);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={field.key} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.unit && (
          <span className="text-xs text-muted-foreground">({field.unit})</span>
        )}
        {isAutoFilled && (
          <Badge variant="secondary" className="text-xs">
            自动填充
          </Badge>
        )}
      </div>

      {renderFieldInput(field, value, onChange, readOnly)}

      {/* Normal range indicator */}
      {field.normalRange && value !== undefined && value !== '' && (
        <div className="flex items-center gap-1 text-xs">
          {isBelow || isAbove ? (
            <>
              <AlertCircle className="h-3 w-3 text-yellow-500" />
              <span className="text-yellow-600">
                {isBelow ? '低于' : '高于'}正常范围 ({field.normalRange[0]}-{field.normalRange[1]} {field.unit})
              </span>
            </>
          ) : (
            <>
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span className="text-green-600">正常范围</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function renderFieldInput(
  field: ReportField,
  value: any,
  onChange: (value: any) => void,
  readOnly?: boolean
) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          id={field.key}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.label}`}
          readOnly={readOnly}
          required={!!field.required}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={field.key}
          value={value || ''}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={`请输入${field.label}`}
          readOnly={readOnly}
          required={!!field.required}
          rows={3}
        />
      );

    case 'number':
    case 'measurement':
      return (
        <Input
          id={field.key}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          placeholder={`请输入${field.label}`}
          readOnly={readOnly}
          required={!!field.required}
          step="0.01"
        />
      );

    case 'select':
      return (
        <Select
          value={value || ''}
          onValueChange={onChange}
          disabled={!!readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder={`请选择${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'image':
    case 'image[]':
      return (
        <div className="border rounded-md p-4 text-center text-muted-foreground text-sm">
          图像占位符 - 从检查中选择截图
        </div>
      );

    default:
      return (
        <Input
          id={field.key}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
        />
      );
  }
}

// ─── Preset Templates ────────────────────────────────────────────────────────

export const OCT_TEMPLATE: ReportTemplate = {
  id: 'oct',
  name: 'OCT 检查报告',
  type: 'oct',
  description: '光学相干断层扫描标准报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'device', label: '设备', type: 'text', section: '基本信息' },
    { key: 'centralThickness', label: '中心凹厚度', type: 'measurement', unit: 'μm', normalRange: [215, 275], section: '视网膜厚度分析' },
    { key: 'averageThickness', label: '平均厚度', type: 'measurement', unit: 'μm', section: '视网膜厚度分析' },
    { key: 'rnflAverage', label: '平均 RNFL', type: 'measurement', unit: 'μm', normalRange: [80, 120], section: 'RNFL 厚度分析' },
    { key: 'rnflSuperior', label: '上方 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflInferior', label: '下方 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflNasal', label: '鼻侧 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflTemporal', label: '颞侧 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '视网膜厚度分析', 'RNFL 厚度分析', '诊断建议'] },
};

export const FUNDUS_TEMPLATE: ReportTemplate = {
  id: 'fundus',
  name: '眼底彩照报告',
  type: 'fundus',
  description: '眼底彩色照相标准报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'discAppearance', label: '视盘形态', type: 'select', options: ['正常', '苍白', '水肿', '凹陷扩大'], section: '眼底所见' },
    { key: 'cdRatioHorizontal', label: 'C/D 比 (水平)', type: 'number', section: '眼底所见' },
    { key: 'cdRatioVertical', label: 'C/D 比 (垂直)', type: 'number', section: '眼底所见' },
    { key: 'maculaAppearance', label: '黄斑区', type: 'select', options: ['正常', '出血', '渗出', '水肿', '新生血管'], section: '眼底所见' },
    { key: 'vesselChanges', label: '血管改变', type: 'textarea', section: '眼底所见' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '眼底所见', '诊断建议'] },
};

export const FFA_TEMPLATE: ReportTemplate = {
  id: 'ffa',
  name: 'FFA 荧光素血管造影报告',
  type: 'ffa',
  description: '荧光素眼底血管造影标准报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'armToRetinaTime', label: '臂-视网膜循环时间', type: 'number', unit: 's', section: '造影数据' },
    { key: 'earlyPhase', label: '早期', type: 'textarea', section: '分期描述' },
    { key: 'midPhase', label: '中期', type: 'textarea', section: '分期描述' },
    { key: 'latePhase', label: '晚期', type: 'textarea', section: '分期描述' },
    { key: 'leakageSites', label: '渗漏部位', type: 'textarea', section: '异常发现' },
    { key: 'blockage', label: '遮蔽荧光', type: 'textarea', section: '异常发现' },
    { key: 'findings', label: '造影所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { columns: 1, sections: ['基本信息', '造影数据', '分期描述', '异常发现', '诊断建议'] },
};

export const VF_TEMPLATE: ReportTemplate = {
  id: 'vf',
  name: '视野检查报告',
  type: 'vf',
  description: '标准自动视野检查报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'strategy', label: '策略', type: 'select', options: ['SITA Standard', 'SITA Fast', 'SITA-Faster', 'Full Threshold'], section: '基本信息' },
    { key: 'md', label: 'MD', type: 'measurement', unit: 'dB', section: '视野指数' },
    { key: 'psd', label: 'PSD', type: 'measurement', unit: 'dB', section: '视野指数' },
    { key: 'vfi', label: 'VFI', type: 'measurement', unit: '%', normalRange: [95, 100], section: '视野指数' },
    { key: 'pattern', label: '缺损模式', type: 'select', options: ['弥漫性', '弓形', '鼻侧阶梯', '中心暗点', '正常'], section: '视野指数' },
    { key: 'reliability', label: '可靠性', type: 'textarea', section: '视野指数' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '视野指数', '诊断建议'] },
};

export const GLAUCOMA_TEMPLATE: ReportTemplate = {
  id: 'glaucoma',
  name: '青光眼报告',
  type: 'glaucoma',
  description: '青光眼综合评估报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'iop', label: '眼压', type: 'measurement', unit: 'mmHg', normalRange: [10, 21], section: '眼压测量' },
    { key: 'iopMethod', label: '测量方法', type: 'select', options: ['非接触', 'Goldmann', 'iCare'], section: '眼压测量' },
    { key: 'rnflAverage', label: '平均 RNFL', type: 'measurement', unit: 'μm', normalRange: [80, 120], section: 'OCT 检查' },
    { key: 'cdRatio', label: 'C/D 比', type: 'number', section: '视盘评估' },
    { key: 'md', label: 'MD', type: 'measurement', unit: 'dB', section: '视野检查' },
    { key: 'psd', label: 'PSD', type: 'measurement', unit: 'dB', section: '视野检查' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'treatment', label: '治疗方案', type: 'textarea', section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '眼压测量', 'OCT 检查', '视盘评估', '视野检查', '诊断建议'] },
};

export const CATARACT_TEMPLATE: ReportTemplate = {
  id: 'cataract',
  name: '白内障术前报告',
  type: 'cataract',
  description: '白内障术前检查报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS'], required: true, section: '基本信息' },
    { key: 'k1', label: 'K1', type: 'measurement', unit: 'D', section: '角膜曲率' },
    { key: 'k2', label: 'K2', type: 'measurement', unit: 'D', section: '角膜曲率' },
    { key: 'acd', label: '前房深度', type: 'measurement', unit: 'mm', section: '生物测量' },
    { key: 'al', label: '眼轴长度', type: 'measurement', unit: 'mm', section: '生物测量' },
    { key: 'lt', label: '晶状体厚度', type: 'measurement', unit: 'mm', section: '生物测量' },
    { key: 'iolFormula', label: 'IOL 公式', type: 'select', options: ['SRK/T', 'Haigis', 'Hoffer Q', 'Holladay 2', 'Barrett'], section: 'IOL 计算' },
    { key: 'targetRefraction', label: '目标屈光度', type: 'number', unit: 'D', section: 'IOL 计算' },
    { key: 'recommendedIol', label: '推荐 IOL 度数', type: 'number', unit: 'D', section: 'IOL 计算' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '角膜曲率', '生物测量', 'IOL 计算', '诊断建议'] },
};

export const REFRACTIVE_TEMPLATE: ReportTemplate = {
  id: 'refractive',
  name: '屈光手术术前报告',
  type: 'refractive',
  description: '屈光手术术前检查报告模板',
  fields: [
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS'], required: true, section: '基本信息' },
    { key: 'cornealThickness', label: '角膜厚度', type: 'measurement', unit: 'μm', section: '角膜检查' },
    { key: 'thinnestPoint', label: '最薄点', type: 'measurement', unit: 'μm', section: '角膜检查' },
    { key: 'k1', label: 'K1', type: 'measurement', unit: 'D', section: '角膜曲率' },
    { key: 'k2', label: 'K2', type: 'measurement', unit: 'D', section: '角膜曲率' },
    { key: 'pupilDiameter', label: '瞳孔直径', type: 'measurement', unit: 'mm', section: '瞳孔检查' },
    { key: 'refraction', label: '屈光度', type: 'text', section: '屈光状态' },
    { key: 'sphericalEquivalent', label: '等效球镜', type: 'number', unit: 'D', section: '屈光状态' },
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'surgeryType', label: '推荐术式', type: 'select', options: ['LASIK', 'SMILE', 'PRK', 'ICL', '其他'], section: '诊断建议' },
  ],
  layout: { columns: 2, sections: ['基本信息', '角膜检查', '角膜曲率', '瞳孔检查', '屈光状态', '诊断建议'] },
};

// Template registry
export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  oct: OCT_TEMPLATE,
  fundus: FUNDUS_TEMPLATE,
  ffa: FFA_TEMPLATE,
  vf: VF_TEMPLATE,
  glaucoma: GLAUCOMA_TEMPLATE,
  cataract: CATARACT_TEMPLATE,
  refractive: REFRACTIVE_TEMPLATE,
};

export function getTemplateByType(type: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES[type];
}
