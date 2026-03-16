import { create } from 'zustand';

interface OrderFilters {
  status?: string[];
  zoneId?: number;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  search?: string;
  department?: string[];
  sentToWms?: boolean;
  sentToChecker?: boolean;
  page: number;
  pageSize: number;
}

interface OrderState {
  selectedOrderIds: Set<number>;
  filters: OrderFilters;
  toggleSelect: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clearSelection: () => void;
  setFilters: (filters: Partial<OrderFilters>) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  selectedOrderIds: new Set(),
  filters: {
    page: 1,
    pageSize: 50,
  },

  toggleSelect: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedOrderIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedOrderIds: newSet };
    }),

  selectAll: (ids) => set({ selectedOrderIds: new Set(ids) }),

  clearSelection: () => set({ selectedOrderIds: new Set() }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
}));
