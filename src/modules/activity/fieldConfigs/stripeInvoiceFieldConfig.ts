import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Snapshot fields are pre-formatted by stripeInvoiceService (the invoice itself lives only in
// Stripe, there's no local row to resolve against later).
export const stripeInvoiceActivityFieldConfig: ActivityFieldConfigMap = {
  total: { label: 'Total' },
  dueDate: { label: 'Due date' },
  lineCount: { label: 'Line items' },
  memo: { label: 'Memo' },
};
