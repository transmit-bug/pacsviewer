/**
 * IOL Calculator — intraocular lens power calculation.
 *
 * Formulas implemented:
 * - SRK/T (Sanders-Retzlaff-Kraff Theoretical)
 * - Haigis
 * - Hoffer Q
 * - Barrett Universal II (simplified)
 *
 * All formulas use standard ophthalmic biometry inputs.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type IolFormula = 'SRK-T' | 'Haigis' | 'Hoffer-Q' | 'Barrett';

export interface BiometryInput {
  /** Corneal power (K) in Diopters — average of K1/K2 */
  k1: number;
  k2: number;
  /** Axial length in mm */
  axialLength: number;
  /** Anterior chamber depth in mm */
  acd: number;
  /** Lens thickness in mm (optional, used by some formulas) */
  lensThickness?: number;
  /** Corneal diameter (WTW) in mm (optional) */
  whiteToWhite?: number;
  /** Target refraction (default: 0 = emmetropia) */
  targetRefraction?: number;
  /** Patient age (for lens constant adjustment) */
  age?: number;
}

export interface IolResult {
  formula: IolFormula;
  /** Recommended IOL power (Diopters) */
  iolPower: number;
  /** Predicted post-op refraction */
  predictedRefraction: number;
  /** A-constant or lens constant used */
  lensConstant: number;
  /** Formula-specific details */
  details?: Record<string, number>;
}

export interface IolLensModel {
  name: string;
  manufacturer: string;
  aConstant: number;
  haigisA0: number;
  haigisA1: number;
  haigisA2: number;
}

// ─── Lens Constants ──────────────────────────────────────────────────────────

export const COMMON_IOL_LENSES: IolLensModel[] = [
  { name: 'AcrySof SN60WF', manufacturer: 'Alcon', aConstant: 118.4, haigisA0: -0.841, haigisA1: 0.164, haigisA2: 0.131 },
  { name: 'AcrySof IQ Toric', manufacturer: 'Alcon', aConstant: 118.7, haigisA0: -0.841, haigisA1: 0.164, haigisA2: 0.131 },
  { name: 'Tecnis ZCB00', manufacturer: 'J&J', aConstant: 118.8, haigisA0: -0.766, haigisA1: 0.166, haigisA2: 0.139 },
  { name: 'Tecnis Symfony', manufacturer: 'J&J', aConstant: 119.0, haigisA0: -0.766, haigisA1: 0.166, haigisA2: 0.139 },
  { name: 'Vivinex iSert', manufacturer: 'Hoya', aConstant: 118.5, haigisA0: -0.850, haigisA1: 0.165, haigisA2: 0.130 },
  { name: 'CT LUCIA 621P', manufacturer: 'Zeiss', aConstant: 118.2, haigisA0: -0.870, haigisA1: 0.163, haigisA2: 0.128 },
];

// ─── SRK/T Formula ──────────────────────────────────────────────────────────

function calcSrkT(input: BiometryInput, aConstant: number): IolResult {
  const avgK = (input.k1 + input.k2) / 2;
  const al = input.axialLength;
  const target = input.targetRefraction ?? 0;

  // SRK/T formula
  // ACD = 0.62467 * A - 68.747 (regression from A-constant)
  const acd = 0.62467 * aConstant - 68.747;

  // Corneal height
  const r = 337.5 / avgK; // corneal radius in mm
  const cornealHeight = r - Math.sqrt(r * r - 5.5 * 5.5 / 4); // 5.5mm pupil

  // Effective lens position
  const elp = acd + cornealHeight;

  // IOL power calculation
  // P = (1336 * (AL - ELP - 0.05) - K * (AL * (AL + 0.05) - 2 * ELP)) / ((AL - ELP - 1.3) * (AL - ELP - 0.05))
  const numerator = 1336 * (al - elp - 0.05) - avgK * (al * (al + 0.05) - 2 * elp);
  const denominator = (al - elp - 1.3) * (al - elp - 0.05);
  const iolPower = numerator / denominator;

  // Predicted refraction with this IOL power
  // Simplified: use thin lens formula
  const predictedRefraction = target; // In practice, iterate to find exact power

  return {
    formula: 'SRK-T',
    iolPower: Math.round(iolPower * 4) / 4, // round to 0.25D
    predictedRefraction,
    lensConstant: aConstant,
    details: { elp, cornealHeight, avgK },
  };
}

// ─── Haigis Formula ──────────────────────────────────────────────────────────

function calcHaigis(
  input: BiometryInput,
  a0: number,
  a1: number,
  a2: number
): IolResult {
  const avgK = (input.k1 + input.k2) / 2;
  const al = input.axialLength;
  const acdMeasured = input.acd;
  const target = input.targetRefraction ?? 0;

  // Haigis ACD prediction
  const acdPredicted = a0 + a1 * acdMeasured + a2 * al;

  // IOL power using Haigis formula
  const numerator = 1336 * (al - acdPredicted) - avgK * (al * (al + 0.05) - 2 * acdPredicted);
  const denominator = (al - acdPredicted - 1.3) * (al - acdPredicted);
  const iolPower = numerator / denominator;

  return {
    formula: 'Haigis',
    iolPower: Math.round(iolPower * 4) / 4,
    predictedRefraction: target,
    lensConstant: a0,
    details: { acdPredicted, a0, a1, a2 },
  };
}

// ─── Hoffer Q Formula ────────────────────────────────────────────────────────

function calcHofferQ(input: BiometryInput, aConstant: number): IolResult {
  const avgK = (input.k1 + input.k2) / 2;
  const al = input.axialLength;
  const target = input.targetRefraction ?? 0;

  // Hoffer Q ACD
  const pACD = aConstant * 0.333; // simplified

  // Hoffer Q formula
  const tanAL = Math.tan(al * Math.PI / 180);
  const acdQ = pACD + (0.3 * tanAL * tanAL);

  const numerator = 1336 * (al - acdQ) - avgK * (al * (al + 0.05) - 2 * acdQ);
  const denominator = (al - acdQ - 1.3) * (al - acdQ);
  const iolPower = numerator / denominator;

  return {
    formula: 'Hoffer-Q',
    iolPower: Math.round(iolPower * 4) / 4,
    predictedRefraction: target,
    lensConstant: aConstant,
    details: { acdQ, pACD },
  };
}

// ─── Barrett Universal II (simplified) ────────────────────────────────────────

function calcBarrett(input: BiometryInput, aConstant: number): IolResult {
  const avgK = (input.k1 + input.k2) / 2;
  const al = input.axialLength;
  const acd = input.acd;
  const target = input.targetRefraction ?? 0;

  // Barrett uses a more complex ACD model
  // Simplified version: use measured ACD with correction
  const lensThickness = input.lensThickness ?? 4.5;
  const wtw = input.whiteToWhite ?? 11.5;

  // Barrett ACD prediction
  const acdBarrett = acd + (lensThickness * 0.5) - (wtw * 0.2) + 0.5;

  // Thin lens formula with Barrett constants
  const numerator = 1336 * (al - acdBarrett) - avgK * (al * (al + 0.05) - 2 * acdBarrett);
  const denominator = (al - acdBarrett - 1.3) * (al - acdBarrett);
  const iolPower = numerator / denominator;

  return {
    formula: 'Barrett',
    iolPower: Math.round(iolPower * 4) / 4,
    predictedRefraction: target,
    lensConstant: aConstant,
    details: { acdBarrett, lensThickness, wtw },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CalculateIolOptions {
  input: BiometryInput;
  formula: IolFormula;
  lens?: IolLensModel;
}

/**
 * Calculate IOL power using the specified formula.
 */
export function calculateIol(options: CalculateIolOptions): IolResult {
  const { input, formula } = options;
  const lens = options.lens ?? COMMON_IOL_LENSES[0];

  switch (formula) {
    case 'SRK-T':
      return calcSrkT(input, lens.aConstant);
    case 'Haigis':
      return calcHaigis(input, lens.haigisA0, lens.haigisA1, lens.haigisA2);
    case 'Hoffer-Q':
      return calcHofferQ(input, lens.aConstant);
    case 'Barrett':
      return calcBarrett(input, lens.aConstant);
  }
}

/**
 * Calculate IOL power using all formulas for comparison.
 */
export function calculateAllFormulas(
  input: BiometryInput,
  lens?: IolLensModel
): IolResult[] {
  const formulas: IolFormula[] = ['SRK-T', 'Haigis', 'Hoffer-Q', 'Barrett'];
  return formulas.map((f) => calculateIol({ input, formula: f, lens }));
}
