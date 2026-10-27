import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const mockSignOut = vi.fn();
const mockSetLanguage = vi.fn();
const mockSetTheme = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut, user: null }),
}));

vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      nav: { dashboard: 'Dashboard', settings: 'Settings', logout: 'Log out' },
      portfolio: { title: 'Portfolio' },
      improvements: { title: 'Improvements' },
      settings: { language: 'Language', theme: 'Theme', backup: 'Backup' },
    },
    language: 'en',
    setLanguage: mockSetLanguage,
  }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: mockSetTheme }),
}));

describe('Sidebar navigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderSidebar = (initialEntry = '/') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Sidebar />
      </MemoryRouter>,
    );

  it.each([
    ['Dashboard', '/'],
    ['Portfolio', '/portfolio'],
    ['Jämför', '/compare'],
    ['Improvements', '/improvements'],
    ['Settings', '/settings'],
  ])('links %s to %s', (label, href) => {
    renderSidebar();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it.each([
    ['/', 'Dashboard'],
    ['/portfolio', 'Portfolio'],
    ['/portfolio/123', 'Portfolio'],
    ['/portfolio/update', 'Portfolio'],
    ['/compare', 'Jämför'],
    ['/improvements', 'Improvements'],
    ['/settings', 'Settings'],
  ])('marks the current section on %s', (path, label) => {
    renderSidebar(path);
    expect(screen.getByRole('link', { name: label })).toHaveClass('bg-sidebar-accent');
  });

  it('does not mark Dashboard active on another route', () => {
    renderSidebar('/settings');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('bg-sidebar-accent');
  });

  it('calls onNavigate when a navigation link is selected', () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar onNavigate={onNavigate} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Portfolio' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
