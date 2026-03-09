import api from './api';

export const trackingApi = {
  getBoard: (date: string) =>
    api.get('/tracking/board', { params: { date } }).then((r) => r.data),

  sendMessage: (recipientId: number, text: string) =>
    api.post('/tracking/messages', { recipientId, text }).then((r) => r.data),

  reportLocation: (latitude: number, longitude: number) =>
    api.post('/tracking/location', { latitude, longitude }).then((r) => r.data),

  getMyMessages: () =>
    api.get('/tracking/my-messages').then((r) => r.data),

  markMessageRead: (messageId: number) =>
    api.patch(`/tracking/messages/${messageId}/read`).then((r) => r.data),

  getUnreadCount: () =>
    api.get('/tracking/my-messages/unread-count').then((r) => r.data),
};
