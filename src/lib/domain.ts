import type { Category, Instrument, Rebalancing, RiskProfile } from '../types';

export const CATEGORIES: Category[] = ['investment_grid', 'asset_allocation_fund', 'model_portfolio', 'fund', 'custom_series', 'uploaded'];
/** Categories only Advanced users can see. */
export const ADVANCED_CATEGORIES: Category[] = ['custom_series', 'uploaded'];
export const CATEGORY_PLURAL: Record<Category, string> = {
  investment_grid: 'Investment grids',
  asset_allocation_fund: 'Asset allocation funds',
  model_portfolio: 'Model portfolios',
  fund: 'Funds',
  custom_series: 'Custom series',
  uploaded: 'Imported from Excel',
};
export const CATEGORY_SINGULAR: Record<Category, string> = {
  investment_grid: 'Investment grid',
  asset_allocation_fund: 'Asset allocation fund',
  model_portfolio: 'Model portfolio',
  fund: 'Fund',
  custom_series: 'Custom series',
  uploaded: 'Imported from Excel',
};
export const RISKS: RiskProfile[] = ['Conservative', 'Income', 'Balanced', 'Growth', 'Equity'];
export const RISK_LEVEL: Record<RiskProfile, number> = { Conservative: 1, Income: 2, Balanced: 3, Growth: 4, Equity: 5 };
export const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];
export const CURRENCY_NAMES: Record<string, string> = { CHF: 'Swiss Franc', EUR: 'Euro', USD: 'US Dollar', GBP: 'Pound Sterling' };
export const SOURCE_LABEL = { api: 'Track record API', custom: 'Custom series', upload: 'Excel import (this session)' } as const;
export const REBALANCING: Record<Rebalancing, { label: string; help: string }> = {
  fixed: { label: 'Fixed weights', help: 'Weights are held at their targets every month.' },
  drift: { label: 'Drifting weights', help: 'Weights drift with performance within each leg (buy & hold).' },
  monthly: { label: 'Monthly rebalancing', help: 'Weights go back to their targets at each month end.' },
  yearly: { label: 'Yearly rebalancing', help: 'Weights drift during the year and go back to their targets at each year end.' },
};


/** Display name: alias overrides the source name. */
export const label = (i: Pick<Instrument, 'alias' | 'name'>) => i.alias || i.name;
