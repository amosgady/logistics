import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '../services/orderApi';
import { useOrderStore } from '../store/orderStore';

export function useOrders() {
  const filters = useOrderStore((s) => s.filters);

  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => orderApi.getOrders(filters),
    staleTime: 30_000,
  });
}

export function useImportCsv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, decisions }: { file: File; decisions?: any }) =>
      orderApi.importCsv(file, decisions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAnalyzeCsvImport() {
  return useMutation({
    mutationFn: (file: File) => orderApi.analyzeCsvImport(file),
  });
}

export function useChangeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: string; reason?: string }) =>
      orderApi.changeStatus(id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useBulkChangeStatus() {
  const queryClient = useQueryClient();
  const clearSelection = useOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: ({ orderIds, targetStatus }: { orderIds: number[]; targetStatus: string }) =>
      orderApi.bulkChangeStatus(orderIds, targetStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inWorkOrders'] });
      clearSelection();
    },
  });
}

export function useUpdateDeliveryDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deliveryDate }: { id: number; deliveryDate: string }) =>
      orderApi.updateDeliveryDate(id, deliveryDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useBulkUpdateDeliveryDate() {
  const queryClient = useQueryClient();
  const clearSelection = useOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: ({ orderIds, deliveryDate }: { orderIds: number[]; deliveryDate: string }) =>
      orderApi.bulkUpdateDeliveryDate(orderIds, deliveryDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
    },
  });
}

export function useBulkDelete() {
  const queryClient = useQueryClient();
  const clearSelection = useOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: (orderIds: number[]) => orderApi.bulkDelete(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
    },
  });
}

export function useDeleteAllOrders() {
  const queryClient = useQueryClient();
  const clearSelection = useOrderStore((s) => s.clearSelection);

  return useMutation({
    mutationFn: () => orderApi.deleteAllOrders(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
    },
  });
}
