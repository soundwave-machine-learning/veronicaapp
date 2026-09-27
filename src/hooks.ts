import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { todayISO } from '../shared/dates';

/** Today's date, updated automatically if the app stays open past midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = todayISO();
      setToday((previous) => (previous === now ? previous : now));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings });

export const useAppointments = (from: string, to: string) =>
  useQuery({ queryKey: ['appointments', from, to], queryFn: () => api.appointments(from, to) });

export const useAppointment = (id: number) =>
  useQuery({ queryKey: ['appointment', id], queryFn: () => api.appointment(id), enabled: Number.isInteger(id) && id > 0 });

export const useNextAfter = (date: string, enabled = true) =>
  useQuery({ queryKey: ['next', date], queryFn: () => api.nextAfter(date), enabled });

export const useUnpaid = () => useQuery({ queryKey: ['unpaid'], queryFn: api.unpaid });

export const useClients = (search = '', archived = false) =>
  useQuery({ queryKey: ['clients', search, archived], queryFn: () => api.clients(search, archived) });

export const useClient = (id: number) =>
  useQuery({ queryKey: ['client', id], queryFn: () => api.client(id), enabled: Number.isInteger(id) && id > 0 });

/**
 * A change to the business data. Afterwards every screen reloads its data,
 * so Today, the Calendar and client histories are always in step.
 */
export function useChange<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
