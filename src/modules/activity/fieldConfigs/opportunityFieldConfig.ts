import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveCatalogName, resolveCompanyName, resolveMoney, resolvePipelineName, resolveStageName, resolveUserName } from './resolvers.js';

export const opportunityActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Deal name' },
  companyId: { label: 'Company', resolve: resolveCompanyName },
  amountCents: { label: 'Amount', resolve: resolveMoney },
  currency: { label: 'Currency' },
  pipelineId: { label: 'Pipeline', resolve: resolvePipelineName },
  stageId: { label: 'Stage', resolve: resolveStageName },
  estimatedCloseDate: { label: 'Estimated close date' },
  ownerId: { label: 'Owner', resolve: resolveUserName },
  lossReasonId: { label: 'Loss reason', resolve: resolveCatalogName },
  winReasonId: { label: 'Win reason', resolve: resolveCatalogName },
  closeNote: { label: 'Close note' },
  nextStepDate: { label: 'Next step date' },
  nextStepNote: { label: 'Next step note' },
};
