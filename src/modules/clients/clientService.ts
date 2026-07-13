import prisma from "../../lib/prisma.js";
import { getDefaultStatusId, recordStatusChange } from "../hr/statusService.js";
import { listCustomFieldValuesForEntities } from "../hr/customFieldService.js";

interface CreateClientInput {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  statusId?: string;
  tenantId: string;
}

interface UpdateClientInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  statusId?: string;
}

export async function createClient(input: CreateClientInput) {
  const statusId = input.statusId ?? (await getDefaultStatusId(input.tenantId, "client"));

  return prisma.client.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      company: input.company,
      statusId,
      tenantId: input.tenantId,
    },
  });
}

export async function listClients(tenantId: string) {
  const clients = await prisma.client.findMany({
    where: { tenantId },
    include: { statusDefn: true },
  });

  const values = await listCustomFieldValuesForEntities(
    tenantId,
    'client',
    clients.map((client) => client.id),
  );

  return clients.map((client) => ({
    ...client,
    customFieldVals: values.filter((value) => value.entityId === client.id),
  }));
}

export async function findClientById(id: string) {
  return prisma.client.findUnique({
    where: { id },
  });
}

export async function updateClient(id: string, input: UpdateClientInput, changedByUserId: string) {
  const existing = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { statusDefn: true },
  });

  const updated = await prisma.client.update({
    where: { id },
    data: input,
    include: { statusDefn: true },
  });

  if (input.statusId && input.statusId !== existing.statusId) {
    await recordStatusChange({
      tenantId: existing.tenantId,
      entityType: 'client',
      entityId: id,
      fromStatusName: existing.statusDefn.name,
      toStatusName: updated.statusDefn.name,
      changedByUserId,
    });
  }

  return updated;
}

export async function deleteClient(id: string) {
  return prisma.client.delete({
    where: { id },
  });
}
