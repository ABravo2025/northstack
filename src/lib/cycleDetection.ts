// Generic walk-the-chain cycle detector for a self-referential parent-pointer field
// (Employee.managerId, Company.parentCompanyId, ...) — used wherever assigning `proposedParentId`
// as `id`'s new parent needs to be rejected because it would create a cycle. `getParentId`
// resolves one step further up the chain for a given id (or null at the root).
export async function wouldCreateCycle(
  id: string,
  proposedParentId: string,
  getParentId: (id: string) => Promise<string | null>,
): Promise<boolean> {
  if (id === proposedParentId) {
    return true;
  }

  let currentId: string | null = proposedParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === id) {
      return true;
    }
    if (visited.has(currentId)) {
      return false;
    }
    visited.add(currentId);
    currentId = await getParentId(currentId);
  }

  return false;
}
