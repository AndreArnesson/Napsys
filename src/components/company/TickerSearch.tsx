import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2 } from 'lucide-react';

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface TickerSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (symbol: string) => void;
  companyName?: string;
}

export function TickerSearch({ open, onOpenChange, onSelect, companyName }: TickerSearchProps) {
  const [query, setQuery] = useState(companyName || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-stock-price', {
        body: { search: query.trim() },
      });
      if (error) throw error;
      setResults(data?.results || []);
    } catch (e: any) {
      console.error('Ticker search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (result: SearchResult) => {
    onSelect(result.symbol);
    onOpenChange(false);
    setResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sök ticker</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Sök bolagsnamn eller ticker..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <Button onClick={handleSearch} disabled={loading || !query.trim()} size="icon">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between gap-2"
                  onClick={() => handleSelect(r)}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-medium">{r.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{r.exchange}</div>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && !loading && query && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tryck enter eller klicka sök för att hitta ticker
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
