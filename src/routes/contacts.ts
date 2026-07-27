import { canCreateHr, canManageCustomFields, canViewHr } from '../modules/auth/permissionService.js';
import { findCompanyById } from '../modules/crm/companyService.js';
import { createContact, deleteContact, findContactById, listContacts, updateContact } from '../modules/crm/contactService.js';
import {
  createCustomFieldValue,
  deleteCustomFieldValue,
  findCustomFieldDefinitionById,
  findCustomFieldValueById,
  isValueValidForFieldType,
  listCustomFieldValuesForEntity,
  updateCustomFieldValue,
} from '../modules/hr/customFieldService.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'disqualified'];

export const contactsRouter = createAsyncRouter();

async function validateContactRefs(
  tenantId: string,
  body: any,
): Promise<{ error: string } | null> {
  if (body.companyId) {
    const company = await findCompanyById(body.companyId);
    if (!company || company.tenantId !== tenantId) {
      return { error: 'Company not found' };
    }
  }

  if (body.leadStatus !== undefined && body.leadStatus !== null && !VALID_LEAD_STATUSES.includes(body.leadStatus)) {
    return { error: 'Invalid lead status' };
  }

  if (body.leadSourceId) {
    const leadSource = await findFieldCatalogDefinitionById(body.leadSourceId);
    if (!leadSource || leadSource.tenantId !== tenantId || leadSource.kind !== 'leadSource') {
      return { error: 'Lead source not found' };
    }
  }

  return null;
}

contactsRouter.get('/api/contacts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contacts = await listContacts(user.tenantId!);
  return res.json(contacts);
});

contactsRouter.post('/api/contacts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.firstName || !req.body.lastName || !req.body.email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  const refError = await validateContactRefs(user.tenantId!, req.body);
  if (refError) {
    return res.status(400).json(refError);
  }

  const contact = await createContact({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(contact);
});

contactsRouter.get('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  return res.json(contact);
});

contactsRouter.patch('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const refError = await validateContactRefs(user.tenantId!, req.body);
  if (refError) {
    return res.status(400).json(refError);
  }

  const updated = await updateContact(req.params.contactId, req.body);
  return res.json(updated);
});

contactsRouter.delete('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  await deleteContact(req.params.contactId);
  return res.status(204).end();
});

contactsRouter.post('/api/contacts/:contactId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId || definition.entityType !== 'contact') {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  if (!isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition.fieldType}'` });
  }

  const customFieldValue = await createCustomFieldValue({
    tenantId: user.tenantId!,
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    entityType: 'contact',
    entityId: req.params.contactId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

contactsRouter.patch('/api/contacts/:contactId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'contact' ||
    existingValue.entityId !== req.params.contactId
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

contactsRouter.delete('/api/contacts/:contactId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'contact' ||
    existingValue.entityId !== req.params.contactId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  await deleteCustomFieldValue(req.params.valueId);
  return res.status(204).end();
});

contactsRouter.get('/api/contacts/:contactId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'contact', req.params.contactId);
  return res.json(values);
});
