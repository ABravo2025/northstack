import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Projects module (2026-10-04). A project's tasks/notes/activity go through the ordinary task,
// note and activity clients with entityType 'project'; this file covers the project itself, its
// phases, its team and templates.

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
export type ProjectTemplateNiche = 'agency' | 'accounting' | 'consulting' | 'internal' | 'custom';

export interface ProjectProgress {
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  nextDueDate: string | null;
  currentPhaseId: string | null;
}

export interface ProjectPhase {
  id: string;
  name: string;
  color: string | null;
  order: number;
}

interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isActive: boolean;
  company: { id: string; name: string } | null;
  ownerEmployee: PersonRef;
  template: { id: string; name: string } | null;
  phases: ProjectPhase[];
  progress: ProjectProgress;
  _count: { members: number };
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  employeeId: string;
  projectRole: string | null;
  employee: PersonRef & { jobTitleDefn: { name: string } | null };
}

export interface ProjectDetail extends Omit<ProjectSummary, '_count'> {
  members: ProjectMember[];
  canEdit: boolean;
}

export interface ProjectLimits {
  maxActiveProjects: number | null;
  openCount: number;
  customTemplatesEnabled: boolean;
}

export interface ProjectOptionEmployee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  hasLogin: boolean;
  userId: string | null;
}

export interface ProjectOptions {
  employees: ProjectOptionEmployee[];
  companies: { id: string; name: string }[];
  ownEmployeeId: string | null;
}

export interface ProjectInput {
  name?: string;
  description?: string | null;
  companyId?: string | null;
  ownerEmployeeId?: string;
  status?: ProjectStatus;
  startDate?: string | null;
  dueDate?: string | null;
  isActive?: boolean;
}

export interface ProjectMemberInput {
  employeeId: string;
  projectRole?: string | null;
}

export interface ProjectTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  niche: ProjectTemplateNiche;
  isSystem: boolean;
  roles: string[];
  taskCount: number;
  phases: { id: string; name: string; color: string | null; taskCount: number }[];
}

export interface ProjectTemplateDetail extends Omit<ProjectTemplateSummary, 'phases'> {
  phases: {
    id: string;
    name: string;
    color: string | null;
    taskCount: number;
    tasks: { id: string; title: string; description: string | null; dueOffsetDays: number | null; projectRole: string | null }[];
  }[];
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) await throwApiError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface ListProjectsParams {
  status?: ProjectStatus;
  archived?: boolean;
  companyId?: string;
  employeeId?: string;
}

export const projectsApi = {
  listProjects: (token: string, params: ListProjectsParams = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.archived) qs.set('archived', 'true');
    if (params.companyId) qs.set('companyId', params.companyId);
    if (params.employeeId) qs.set('employeeId', params.employeeId);
    const q = qs.toString();
    return call<{ projects: ProjectSummary[]; limits: ProjectLimits }>(token, `/api/projects${q ? `?${q}` : ''}`);
  },

  getProjectOptions: (token: string, projectId?: string) =>
    call<ProjectOptions>(token, `/api/projects/options${projectId ? `?projectId=${projectId}` : ''}`),

  getProject: (token: string, id: string) => call<ProjectDetail>(token, `/api/projects/${id}`),

  createProject: (token: string, data: ProjectInput & { name: string; ownerEmployeeId: string; members?: ProjectMemberInput[]; phases?: { name: string }[] }) =>
    call<ProjectDetail>(token, '/api/projects', { method: 'POST', body: JSON.stringify(data) }),

  updateProject: (token: string, id: string, data: ProjectInput) =>
    call<ProjectDetail>(token, `/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  createProjectPhase: (token: string, projectId: string, data: { name: string; color?: string | null }) =>
    call<ProjectPhase>(token, `/api/projects/${projectId}/phases`, { method: 'POST', body: JSON.stringify(data) }),

  updateProjectPhase: (token: string, projectId: string, phaseId: string, data: { name?: string; color?: string | null }) =>
    call<ProjectPhase>(token, `/api/projects/${projectId}/phases/${phaseId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteProjectPhase: (token: string, projectId: string, phaseId: string) =>
    call<void>(token, `/api/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' }),

  reorderProjectPhases: (token: string, projectId: string, phaseIds: string[]) =>
    call<ProjectPhase[]>(token, `/api/projects/${projectId}/phases/order`, { method: 'PUT', body: JSON.stringify({ phaseIds }) }),

  addProjectMember: (token: string, projectId: string, data: ProjectMemberInput) =>
    call<ProjectMember>(token, `/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(data) }),

  updateProjectMember: (token: string, projectId: string, memberId: string, projectRole: string | null) =>
    call<ProjectMember>(token, `/api/projects/${projectId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ projectRole }) }),

  removeProjectMember: (token: string, projectId: string, memberId: string) =>
    call<void>(token, `/api/projects/${projectId}/members/${memberId}`, { method: 'DELETE' }),

  listProjectTemplates: (token: string, locale: string) =>
    call<{ templates: ProjectTemplateSummary[]; customTemplatesEnabled: boolean }>(token, `/api/project-templates?locale=${locale}`),

  getProjectTemplate: (token: string, id: string) => call<ProjectTemplateDetail>(token, `/api/project-templates/${id}`),

  deleteProjectTemplate: (token: string, id: string) => call<void>(token, `/api/project-templates/${id}`, { method: 'DELETE' }),

  createProjectFromTemplate: (
    token: string,
    data: ProjectInput & { templateId: string; name: string; ownerEmployeeId: string; members?: ProjectMemberInput[] },
  ) => call<ProjectDetail>(token, '/api/projects/from-template', { method: 'POST', body: JSON.stringify(data) }),

  saveProjectAsTemplate: (token: string, projectId: string, data: { name: string; description?: string | null; locale: string }) =>
    call<ProjectTemplateDetail>(token, `/api/projects/${projectId}/save-as-template`, { method: 'POST', body: JSON.stringify(data) }),
};
