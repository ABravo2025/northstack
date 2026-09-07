import { canManageContact, canManageCustomFields, canViewContact } from '../modules/auth/permissionService.js';
import { redactEntityFields, redactEntityListFields } from '../modules/auth/fieldVisibilityService.js';
import { findCompanyById } from '../modules/crm/companyService.js';
import { createContact, deactivateContact, findContactById, listContacts, updateContact } from '../modules/crm/contactService.js';
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
import { recordCustomFieldValueActivity } from '../modules/activity/customFieldActivity.js';
import { contactDisplayName } from '../modules/activity/fieldConfigs/contactFieldConfig.js';
import { exportContactsToCsv, getContactsCsvTemplate, importContactsFromCsv } from '../modules/csv/csvService.js';
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

  if (!canViewContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contacts = await listContacts(user.tenantId!);
  return res.json(redactEntityListFields(contacts, 'contact', user.roleContext));
});

contactsRouter.post('/api/contacts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.firstName || !req.body.lastName || !req.body.email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  const refError = await validateContactRefs(user.tenantId!, req.body);
  if (refError) {
    return res.status(400).json(refError);
  }

  try {
    const contact = await createContact({ ...req.body, tenantId: user.tenantId! }, user.id);
    return res.status(201).json(redactEntityFields(contact, 'contact', user.roleContext));
  } catch (error) {
    // Contact.email is unique per tenant, but deactivating one doesn't free its email — without
    // this, re-creating (or a public Form re-capturing) the same address as a deactivated Contact
    // hits the DB constraint and would otherwise surface as an unhandled 500.
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(400).json({ error: `A contact with email "${req.body.email}" already exists` });
    }
    throw error;
  }
});

contactsRouter.get('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  return res.json(redactEntityFields(contact, 'contact', user.roleContext));
});

contactsRouter.patch('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageContact(user.roleContext)) {
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

  try {
    const updated = await updateContact(req.params.contactId, req.body, user.id);
    return res.json(redactEntityFields(updated, 'contact', user.roleContext));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(400).json({ error: `A contact with email "${req.body.email}" already exists` });
    }
    throw error;
  }
});

// Soft: deactivates instead of deleting (docs/tareas/specredisenosalesv2.md
// §2.2) — kept on the DELETE verb/route since that's still the right REST
// shape for "remove this from active use", only what happens underneath
// changed. Never blocks, never destroys — no request body needed anymore.
contactsRouter.delete('/api/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const contact = await findContactById(req.params.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const result = await deactivateContact(req.params.contactId, user.id);
  return res.json(result);
});

contactsRouter.post('/api/contacts/:contactId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
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

  await recordCustomFieldValueActivity({
    tenantId: user.tenantId!,
    entityType: 'contact',
    entityId: req.params.contactId,
    entityLabel: contactDisplayName(contact),
    fieldDefinitionId: definition.id,
    fieldName: definition.name,
    oldValue: null,
    newValue: customFieldValue.value,
    changedByUserId: user.id,
  });

  return res.status(201).json(customFieldValue);
});

contactsRouter.patch('/api/contacts/:contactId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
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

  await recordCustomFieldValueActivity({
    tenantId: user.tenantId!,
    entityType: 'contact',
    entityId: req.params.contactId,
    entityLabel: contactDisplayName(contact),
    fieldDefinitionId: definition.id,
    fieldName: definition.name,
    oldValue: existingValue.value,
    newValue: updated.value,
    changedByUserId: user.id,
  });

  return res.json(updated);
});

contactsRouter.delete('/api/contacts/:contactId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
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

  const definition = await findCustomFieldDefinitionById(existingValue.customFieldDefinitionId);
  if (definition) {
    await recordCustomFieldValueActivity({
      tenantId: user.tenantId!,
      entityType: 'contact',
      entityId: req.params.contactId,
      entityLabel: contactDisplayName(contact),
      fieldDefinitionId: definition.id,
      fieldName: definition.name,
      oldValue: existingValue.value,
      newValue: null,
      changedByUserId: user.id,
    });
  }

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

contactsRouter.get('/api/contacts/export/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await exportContactsToCsv(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  return res.send(csv);
});

contactsRouter.post('/api/contacts/import/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) {
    return res.status(400).json({ error: 'csv is required' });
  }

  const result = await importContactsFromCsv(user.tenantId!, req.body.csv, user.id);
  return res.json(result);
});

contactsRouter.get('/api/contacts/template/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageContact(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await getContactsCsvTemplate(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts-import-template.csv"');
  return res.send(csv);
});
