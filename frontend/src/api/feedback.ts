import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

export const feedbackApi = {
  // Feedback
  sendFeedback: async (token: string, data: { message: string; pageUrl: string }): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
  },
};
