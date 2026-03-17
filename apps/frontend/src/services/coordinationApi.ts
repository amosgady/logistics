import api from './api';

export const coordinationApi = {
  sendToDriver: (routeId: number) =>
    api.post('/coordination/send-to-driver', { routeId }).then((r) => r.data),

  unsendFromDriver: (routeId: number) =>
    api.post('/coordination/unsend-from-driver', { routeId }).then((r) => r.data),

  unsendOrder: (orderId: number) =>
    api.post('/coordination/unsend-order', { orderId }).then((r) => r.data),

  exportWmsCsv: async (routeId: number, coordinatorName?: string) => {
    try {
      const response = await api.post('/coordination/export-wms', { routeId, coordinatorName }, {
        responseType: 'blob',
      });
      // Trigger browser download
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const disposition = response.headers['content-disposition'];
      let filename = 'wms_export.csv';
      const utf8Match = disposition?.match(/filename\*=UTF-8''(.+)/);
      if (utf8Match) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const basicMatch = disposition?.match(/filename="(.+)"/);
        if (basicMatch) filename = basicMatch[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error: any) {
      // When responseType is 'blob', error response is also a blob - parse it
      if (error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error?.message || json.message || 'שגיאה ביצוא WMS');
        } catch (e) {
          if (e instanceof SyntaxError) throw new Error(text || 'שגיאה ביצוא WMS');
          throw e;
        }
      }
      throw error;
    }
  },

  unsendWmsExport: (orderId: number) =>
    api.post('/coordination/unsend-wms', { orderId }).then((r) => r.data),

  sendToChecker: (routeId: number) =>
    api.post('/coordination/send-to-checker', { routeId }).then((r) => r.data),

  unsendFromChecker: (orderId: number) =>
    api.post('/coordination/unsend-from-checker', { orderId }).then((r) => r.data),

  unsendWmsRoute: (routeId: number) =>
    api.post('/coordination/unsend-wms-route', { routeId }).then((r) => r.data),

  unsendCheckerRoute: (routeId: number) =>
    api.post('/coordination/unsend-checker-route', { routeId }).then((r) => r.data),
};
