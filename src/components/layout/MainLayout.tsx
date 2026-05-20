import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, TrendingUp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="hidden md:flex w-64 flex-shrink-0 border-r border-border">
          <Sidebar />
        </aside>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-4/5 max-w-72 p-0 [&>button]:hidden">
            <Sidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        {isMobile && (
          <header className="flex h-14 items-center gap-3 border-b border-border px-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-semibold">Napsys</span>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="container py-6 md:py-8 px-4 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
