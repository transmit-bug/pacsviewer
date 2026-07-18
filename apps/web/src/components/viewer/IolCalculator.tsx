/**
 * IolCalculator — IOL power calculation component.
 *
 * Supports multiple formulas (SRK/T, Haigis, Hoffer Q, Barrett).
 * Input: biometry data + lens selection.
 * Output: IOL power recommendations with predicted refraction.
 */

import { useState, useMemo } from 'react';
import {
  calculateAllFormulas,
  COMMON_IOL_LENSES,
  type BiometryInput,
} from '@/lib/iol-calculator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IolCalculatorProps {
  /** Pre-filled biometry data */
  defaultValues?: Partial<BiometryInput>;
  className?: string;
}

export function IolCalculator({ defaultValues, className }: IolCalculatorProps) {
  const [k1, setK1] = useState(defaultValues?.k1?.toString() ?? '43.5');
  const [k2, setK2] = useState(defaultValues?.k2?.toString() ?? '44.0');
  const [axialLength, setAxialLength] = useState(defaultValues?.axialLength?.toString() ?? '23.5');
  const [acd, setAcd] = useState(defaultValues?.acd?.toString() ?? '3.2');
  const [lensThickness, setLensThickness] = useState(defaultValues?.lensThickness?.toString() ?? '4.5');
  const [whiteToWhite, setWhiteToWhite] = useState(defaultValues?.whiteToWhite?.toString() ?? '11.8');
  const [targetRefraction, setTargetRefraction] = useState(defaultValues?.targetRefraction?.toString() ?? '0');
  const [selectedLensIdx, setSelectedLensIdx] = useState(0);

  const input: BiometryInput = useMemo(() => ({
    k1: parseFloat(k1) || 0,
    k2: parseFloat(k2) || 0,
    axialLength: parseFloat(axialLength) || 0,
    acd: parseFloat(acd) || 0,
    lensThickness: parseFloat(lensThickness) || undefined,
    whiteToWhite: parseFloat(whiteToWhite) || undefined,
    targetRefraction: parseFloat(targetRefraction) || 0,
  }), [k1, k2, axialLength, acd, lensThickness, whiteToWhite, targetRefraction]);

  const lens = COMMON_IOL_LENSES[selectedLensIdx];

  const results = useMemo(() => {
    if (!input.k1 || !input.k2 || !input.axialLength || !input.acd) return [];
    return calculateAllFormulas(input, lens);
  }, [input, lens]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Biometry Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            生物测量参数
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">K1 (D)</Label>
              <Input
                type="number"
                step="0.01"
                value={k1}
                onChange={(e) => setK1(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">K2 (D)</Label>
              <Input
                type="number"
                step="0.01"
                value={k2}
                onChange={(e) => setK2(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">眼轴长度 (mm)</Label>
              <Input
                type="number"
                step="0.01"
                value={axialLength}
                onChange={(e) => setAxialLength(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">前房深度 (mm)</Label>
              <Input
                type="number"
                step="0.01"
                value={acd}
                onChange={(e) => setAcd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">晶体厚度 (mm)</Label>
              <Input
                type="number"
                step="0.01"
                value={lensThickness}
                onChange={(e) => setLensThickness(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">WTW (mm)</Label>
              <Input
                type="number"
                step="0.01"
                value={whiteToWhite}
                onChange={(e) => setWhiteToWhite(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">目标屈光度 (D)</Label>
              <Input
                type="number"
                step="0.25"
                value={targetRefraction}
                onChange={(e) => setTargetRefraction(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lens Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">IOL 晶体选择</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_IOL_LENSES.map((l, idx) => (
              <Button
                key={l.name}
                variant={selectedLensIdx === idx ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedLensIdx(idx)}
              >
                {l.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {lens.manufacturer} · A常数: {lens.aConstant}
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">计算结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {results.map((r) => (
                <div key={r.formula} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{r.formula}</Badge>
                  </div>
                  <p className="text-2xl font-bold font-mono text-center">
                    {r.iolPower.toFixed(2)} D
                  </p>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    IOL 度数
                  </p>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">推荐范围</span>
                <span className="font-mono font-medium">
                  {Math.min(...results.map(r => r.iolPower)).toFixed(2)} — {Math.max(...results.map(r => r.iolPower)).toFixed(2)} D
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">平均值</span>
                <span className="font-mono font-medium">
                  {(results.reduce((s, r) => s + r.iolPower, 0) / results.length).toFixed(2)} D
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">目标屈光</span>
                <span className="font-mono">{parseFloat(targetRefraction).toFixed(2)} D</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
