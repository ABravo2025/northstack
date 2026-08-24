import { canCreateHr, canManageCustomFields, canViewHr } from '../modules/auth/permissionService.js';
import {
  createCompany,
  deleteCompany,
  findCompanyById,
  listCompanies,
  updateCompany,
  wouldCreateCompanyHierarchyCycle,
} from '../modules/crm/companyService.js';
import { findContactById } from '../modules/crm/contactService.js';
import {
  createCustomFieldValue,
  deleteCustomFieldValue,
  findCustomFieldDefinitionById,
  findCustomFieldValueById,
  isValueValidForFieldType,
  listCustomFieldValuesForEntity,
  updateCustomFieldValue,
} from '../modules/hr/customFieldService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const companiesRouter = createAsyncRouter();

companiesRouter.get('/api/companies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const companies = await listCompanies(user.tenantId!);
  return res.json(companies);
});

companiesRouter.post('/api/companies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.name || !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const rawContact = req.body.contact;
  let contact: { firstName: string; lastName: string; email: string } | { contactId: string };
  if (rawContact?.contactId) {
    const existing = await findContactById(rawContact.contactId);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    contact = { contactId: rawContact.contactId };
  } else if (rawContact?.firstName?.trim() && rawContact?.lastName?.trim() && rawContact?.email?.trim()) {
    contact = { firstName: rawContact.firstName, lastName: rawContact.lastName, email: rawContact.email };
  } else {
    return res.status(400).json({ error: 'A contact (new or existing) is required to create a company' });
  }

  if (req.body.accountOwnerId) {
    const owner = await findUserById(req.body.accountOwnerId);
    if (!owner || owner.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Account owner not found' });
    }
  }

  const company = await createCompany({ ...req.body, contact, tenantId: user.tenantId! });
  return res.status(201).json(company);
});

companiesRouter.get('/api/companies/:companyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  return res.json(company);
});

companiesRouter.patch('/api/companies/:companyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  if (req.body.accountOwnerId) {
    const owner = await findUserById(req.body.accountOwnerId);
    if (!owner || owner.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Account owner not found' });
    }
  }

  if (req.body.parentCompanyId) {
    const parent = await findCompanyById(req.body.parentCompanyId);
    if (!parent || parent.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Parent company not found' });
    }
    const wouldCycle = await wouldCreateCompanyHierarchyCycle(req.params.companyId, req.body.parentCompanyId);
    if (wouldCycle) {
      return res.status(400).json({ error: 'This would create a company hierarchy cycle' });
    }
  }

  const updated = await updateCompany(req.params.companyId, req.body);
  return res.json(updated);
});

companiesRouter.delete('/api/companies/:companyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const result = await deleteCompany(req.params.companyId, {
    deleteLinkedOpportunities: req.body?.deleteLinkedOpportunities === true,
    cascadeToChildCompanies: req.body?.cascadeToChildCompanies === true,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

companiesRouter.post('/api/companies/:companyId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId || definition.entityType !== 'company') {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  if (!isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition.fieldType}'` });
  }

  const customFieldValue = await createCustomFieldValue({
    tenantId: user.tenantId!,
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    entityType: 'company',
    entityId: req.params.companyId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

companiesRouter.patch('/api/companies/:companyId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'company' ||
    existingValue.entityId !== req.params.companyId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  const definition = await findCustomFieldDefinitionById(existingValue.customFieldDefinitionId);
  if (!definition || !isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition?.fieldType}'` });
  }

  const updated = await updateCustomFieldValue(req.params.valueId, req.body.value);
  return res.json(updated);
});

companiesRouter.delete('/api/companies/:companyId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'company' ||
    existingValue.entityId !== req.params.companyId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  await deleteCustomFieldValue(req.params.valueId);
  return res.status(204).end();
});

companiesRouter.get('/api/companies/:companyId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const company = await findCompanyById(req.params.companyId);
  if (!company || company.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'company', req.params.companyId);
  return res.json(values);
});
