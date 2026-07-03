import prisma from "../../lib/prisma.js";
import { ClientStatus } from "@prisma/client";

interface CreateClientInput {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  tenantId: string;
}

interface UpdateClientInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  status?: ClientStatus;
}

export async function createClient(input: CreateClientInput) {
  return prisma.client.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      company: input.company,
      tenantId: input.tenantId,
      status: "prospect",
    },
  });
}

export async function listClients(tenantId: string) {
  return prisma.client.findMany({
    where: { tenantId },
  });
}

export async function findClientById(id: string) {
  return prisma.client.findUnique({
    where: { id },
  });
}

export async function updateClient(id: string, input: UpdateClientInput) {
  return prisma.client.update({
    where: { id },
    data: input,
  });
}

export async function deleteClient(id: string) {
  return prisma.client.delete({
    where: { id },
  });
}

export function getClientStatusLabel(status: ClientStatus): string {
  const labels: Record<ClientStatus, string> = {
    active: "Active",
    inactive: "Inactive",
    prospect: "Prospect",
    inactive_archived: "Archived",
  };
  return labels[status] || status;
}
