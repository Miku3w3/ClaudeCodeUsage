/**
 * CostCalculator — re-export wrapper for backward compatibility.
 * All pricing logic now lives in pricing.ts (multi-provider + currency support).
 */
export {
  normalizeModelName,
  calculateCost,
  formatCost,
  abbreviateTokens,
  resolvePricing,
  convertCurrency,
} from './pricing';
