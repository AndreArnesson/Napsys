/* eslint-disable @typescript-eslint/no-explicit-any -- Backup tests use generic mocked database rows. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

import { createBackup, getLastBackupAt, LAST_BACKUP_KEY, runBackup } from './backup';

type PageResolver = (table: string, from: number, to: number, ordered: boolean) => {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

function mockTables(resolvePage: PageResolver) {
  const ranges: Array<{ table: string; from: number; to: number; ordered: boolean }> = [];
  supabaseMock.from.mockImplementation((table: string) => {
    let ordered = false;
    const query: any = {
      select: () => query,
      order: () => { ordered = true; return query; },
      range: async (from: number, to: number) => {
        ranges.push({ table, from, to, ordered });
        return resolvePage(table, from, to, ordered);
      },
    };
    return query;
  });
  return ranges;
}

describe('Napsys backup workflows', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports all pages, retries without ordering, and records table-specific errors', async () => {
    const ranges = mockTables((table, from, _to, ordered) => {
      if (table === 'companies') {
        if (from === 0) return { data: Array.from({ length: 1000 }, (_, index) => ({ id: `company-${index}` })), error: null };
        if (from === 1000) return { data: [{ id: 'company-1000' }], error: null };
        return { data: [], error: null };
      }
      if (table === 'analyses' && ordered) return { data: null, error: { message: 'order unavailable' } };
      if (table === 'analyses' && !ordered && from === 0) return { data: [{ id: 'analysis-1' }], error: null };
      if (table === 'reports') return { data: null, error: { message: 'permission denied' } };
      return { data: [], error: null };
    });

    const backup = await createBackup();

    expect(backup).toMatchObject({ app: 'napsys', schema_version: 1, user_id: 'user-1' });
    expect(backup.row_counts.companies).toBe(1001);
    expect(backup.tables.analyses).toEqual([{ id: 'analysis-1' }]);
    expect(backup.errors.reports).toBe('permission denied');
    expect(ranges.filter(call => call.table === 'companies').map(call => call.from)).toEqual([0, 1000, 1001]);
    expect(ranges.some(call => call.table === 'analyses' && call.ordered)).toBe(true);
    expect(ranges.some(call => call.table === 'analyses' && !call.ordered)).toBe(true);
  });

  it('downloads a JSON backup and stores its timestamp, then clears its running lock', async () => {
    mockTables(() => ({ data: [], error: null }));
    vi.useFakeTimers();
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn(() => 'blob:backup');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      const backup = await runBackup();
      expect(getLastBackupAt()).toBe(backup.exported_at);
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(backup.exported_at);
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a[download^="napsys-backup-"]')).toBeNull();

      await vi.advanceTimersByTimeAsync(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
      await expect(runBackup()).resolves.toMatchObject({ app: 'napsys' });
    } finally {
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else delete (URL as any).createObjectURL;
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else delete (URL as any).revokeObjectURL;
    }
  });
});
