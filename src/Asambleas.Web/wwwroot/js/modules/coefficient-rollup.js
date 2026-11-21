/**
 * Mirrors CoefficientValidator (scale 4, tolerance 0.0001, delta = 100 - total).
 * Positive delta means the rollup is short. This is not assembly quorum.
 */
export const COEFFICIENT_SCALE = 4;
export const COEFFICIENT_TOLERANCE = 0.0001;
export const COEFFICIENT_EXPECTED = 100;

export function formatCoefficientAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const factor = 10 ** COEFFICIENT_SCALE;
  const rounded = Math.round(n * factor) / factor;
  return rounded.toFixed(COEFFICIENT_SCALE).replace(/\.?0+$/, "");
}

export function coefficientRollupCopy(snapshot) {
  const total = Number(snapshot?.totalPercent ?? 0);
  const delta = Number(snapshot?.deltaPercent ?? 0);
  const withinTolerance = Math.abs(total - COEFFICIENT_EXPECTED) <= COEFFICIENT_TOLERANCE;
  const complete = snapshot?.isComplete === true || (snapshot?.isComplete == null && withinTolerance);
  const totalTxt = formatCoefficientAmount(total);
  if (complete) {
    return { tone: "ok", text: `Total de coeficientes completo: ${totalTxt} %.` };
  }
  const gap = formatCoefficientAmount(Math.abs(delta));
  if (delta > 0) {
    return { tone: "short", text: `Total de coeficientes: ${totalTxt} %. Falta ${gap} %.` };
  }
  return { tone: "over", text: `Total de coeficientes: ${totalTxt} %. Excede ${gap} %.` };
}
