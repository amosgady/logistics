import api from './api';

export const coordinationApi = {
  sendToDriver: (routeId: number) =>
    api.post('/coordination/send-to-driver', { routeId }).then((r) => r.data),

  unsendFromDriver: (routeId: number) =>
    api.post('/coordination/unsend-from-driver', { routeId }).then((r) => r.data),

  unsendOrder: (orderId: number) =>
    api.post('/coordination/unsend-order', { orderId }).then((r) => r.data),

  exportWmsCsv: async (routeId: number, coordinatorName?: string) => {
    const response = await api.post('/coordination/export-wms', { routeId, coordinatorName }, {
      responseType: 'blob',
    });
    // Trigger browser download
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = response.headers['content-disposition'];
    const filename = disposition?.match(/filename="(.+)"/)?.[1] || 'wms_export.csv';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
