import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '../services/orderApi';
import { useInWorkOrderStore } from '../store/inWorkOrderStore';

export function useInWorkOrders() {
  const filters = useInWorkOrderStore((s) => s.filters);

  return useQuery({
    queryKey: ['inWorkOrders', filters],
    queryFn: () => orderApi.getOrders(filters),
    staleTime: 30_000,
  });
}

export function useBulkChangeStatusInWork() {
  const queryClient = useQueryClient();
  const clearSelection = useInWorkOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: ({ orderIds, targetStatus }: { orderIds: number[]; targetStatus: string }) =>
      orderApi.bulkChangeStatus(orderIds, targetStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inWorkOrders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
    },
  });
}

export function useBulkUpdateDeliveryDateInWork() {
  const queryClient = useQueryClient();
  const clearSelection = useInWorkOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: ({ orderIds, deliveryDate }: { orderIds: number[]; deliveryDate: string }) =>
      orderApi.bulkUpdateDeliveryDate(orderIds, deliveryDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inWorkOrders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
    },
  });
}
