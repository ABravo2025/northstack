// Single source of truth for the signup survey's company-size bands (CompleteSignupPage.tsx)
// and the plan-recommendation logic that reads them back (PlansModal.tsx's recommendedTier) —
// before this they were two independent hardcoded literals that happened to match. Renaming or
// reordering a band now only requires touching this file.
export const COMPANY_SIZE_1_10 = '1-10';
export const COMPANY_SIZE_11_50 = '11-50';
export const COMPANY_SIZE_51_200 = '51-200';
export const COMPANY_SIZE_201_500 = '201-500';
export const COMPANY_SIZE_500_PLUS = '500+';

export const COMPANY_SIZE_OPTIONS = [
  COMPANY_SIZE_1_10,
  COMPANY_SIZE_11_50,
  COMPANY_SIZE_51_200,
  COMPANY_SIZE_201_500,
  COMPANY_SIZE_500_PLUS,
];
