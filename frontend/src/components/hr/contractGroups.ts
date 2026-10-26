import type { ContractGroup } from '../../api';

// Contracts tab (2026-10-26): the order the sections appear in, and each one's chip color —
// shared by the tab and the contract details modal.
export const CONTRACT_GROUP_ORDER: ContractGroup[] = ['pending_signature', 'active', 'upcoming', 'ended'];

export const CONTRACT_GROUP_COLORS: Record<ContractGroup, string> = {
  pending_signature: '#d97706',
  active: '#059669',
  upcoming: '#7c5cff',
  ended: '#9ca3af',
};
