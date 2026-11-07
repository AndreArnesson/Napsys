import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useStockCompanions, refreshCompanionSharing } from '@/hooks/useStockCompanions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

type CompanionAction =
  | { kind: 'request'; email: string }
  | { kind: 'respond'; id: string; accept: boolean }
  | { kind: 'remove'; id: string }
  | { kind: 'all'; userId: string; enabled: boolean };

type SharedCompany = {
  id: string;
  name: string;
  user_id: string;
  analyses: { id: string; name: string | null; created_at: string }[];
};

function SharedCompanyList({ companies, direction }: {
  companies: { company: SharedCompany; people: string[] }[];
  direction: 'incoming' | 'outgoing';
}) {
  const { t, language } = useLanguage();
  if (companies.length === 0) {
    return <p className="text-sm text-muted-foreground">{direction === 'incoming' ? t.companions.noIncoming : t.companions.noOutgoing}</p>;
  }
  return <ul className="space-y-3">
    {companies.map(({ company, people }) => <li key={company.id} className="rounded-lg border p-4 space-y-2">
      <Link to={`/company/${company.id}?tab=analysis`} className="font-medium text-primary hover:underline">{company.name}</Link>
      <p className="text-xs text-muted-foreground break-words">
        {direction === 'incoming' ? t.companions.sharedBy : t.companions.sharedWith}: {people.join(', ')}
      </p>
      {company.analyses.length === 0 ? <p className="text-sm text-muted-foreground">{t.companions.noAnalyses}</p>
        : <ul className="space-y-1">
          {[...company.analyses].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(analysis => <li key={analysis.id}>
            <Link className="text-sm hover:underline" to={`/company/${company.id}/analysis/${analysis.id}`}>
              {analysis.name || t.analysis.title}
              <span className="ml-2 text-xs text-muted-foreground">{new Date(analysis.created_at).toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB')}</span>
            </Link>
          </li>)}
        </ul>}
    </li>)}
  </ul>;
}

export function StockCompanionsSettings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const emailId = useId();
  const [tab, setTab] = useState('companions');
  const [email, setEmail] = useState('');
  const [requestError, setRequestError] = useState('');
  const companions = useStockCompanions();
  const sharing = useQuery({
    queryKey: ['companion-analysis-sharing', user?.id],
    enabled: !!user && tab !== 'companions',
    queryFn: async () => {
      const [incoming, own, grants] = await Promise.all([
        supabase.from('companies').select('id, name, user_id, analyses(id, name, created_at)')
          .neq('user_id', user!.id).order('name'),
        supabase.from('companies').select('id, name, user_id, analyses(id, name, created_at)')
          .eq('user_id', user!.id).order('name'),
        supabase.from('shares').select('company_id, shared_with_user_id, shared_with_email').eq('owner_id', user!.id),
      ]);
      if (incoming.error) throw incoming.error;
      if (own.error) throw own.error;
      if (grants.error) throw grants.error;
      return { incoming: incoming.data ?? [], own: own.data ?? [], grants: grants.data ?? [] };
    },
  });

  const action = useMutation({
    mutationFn: async (change: CompanionAction) => {
      let result;
      switch (change.kind) {
        case 'request': result = await supabase.rpc('request_stock_companion', { _email: change.email }); break;
        case 'respond': result = await supabase.rpc('respond_stock_companion', { _connection_id: change.id, _accept: change.accept }); break;
        case 'remove': result = await supabase.rpc('remove_stock_companion', { _connection_id: change.id }); break;
        case 'all': result = await supabase.rpc('set_companion_share_all', { _companion_id: change.userId, _enabled: change.enabled }); break;
      }
      if (result.error) throw result.error;
    },
    onSuccess: async (_data, change) => {
      if (change.kind === 'request') {
        setEmail('');
        setRequestError('');
        toast.success(t.companions.requestSent);
      } else if (change.kind === 'all') {
        toast.success(change.enabled ? t.companions.shareAllSuccess : t.companions.stopAllSuccess);
      } else if (change.kind === 'remove') {
        toast.success(t.companions.removed);
      } else if (change.accept) {
        toast.success(t.companions.accepted);
      }
      await refreshCompanionSharing(queryClient);
    },
    onError: (error: { code?: string }, change) => {
      if (change.kind === 'request') {
        setRequestError(error.code === 'P0002' ? t.companions.notFound
          : error.code === '22023' ? t.companions.self
          : error.code === '23505' ? t.companions.alreadyConnected : t.companions.actionFailed);
      } else toast.error(t.companions.actionFailed);
    },
  });

  const request = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || action.isPending) return;
    setRequestError('');
    action.mutate({ kind: 'request', email: email.trim().toLowerCase() });
  };
  const friends = companions.data ?? [];
  const incoming = (sharing.data?.incoming ?? []).map(company => ({
    company,
    people: [friends.find(friend => friend.user_id === company.user_id)?.email ?? t.companions.otherUser],
  }));
  const outgoing = (sharing.data?.own ?? []).map(company => ({
    company,
    people: [...new Set([
      ...friends.filter(friend => friend.status === 'accepted' && friend.sharing_all).map(friend => friend.email),
      ...(sharing.data?.grants ?? []).filter(grant => grant.company_id === company.id).map(grant => grant.shared_with_email),
    ])],
  })).filter(entry => entry.people.length > 0);

  const sharedContent = (direction: 'incoming' | 'outgoing') => sharing.isPending || companions.isPending
    ? <p role="status" className="text-sm text-muted-foreground">{t.common.loading}</p>
    : sharing.isError || companions.isError ? <div role="alert" className="space-y-2">
      <p className="text-sm text-destructive">{t.companions.sharesLoadFailed}</p>
      <Button variant="outline" size="sm" onClick={() => { sharing.refetch(); companions.refetch(); }}>{t.sharing.retry}</Button>
    </div> : <SharedCompanyList direction={direction} companies={direction === 'incoming' ? incoming : outgoing} />;

  return <Card id="stock-companions" className="scroll-mt-6">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{t.companions.title}</CardTitle>
      <CardDescription>{t.companions.description}</CardDescription>
    </CardHeader>
    <CardContent>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="companions" className="text-xs sm:text-sm">{t.companions.title}</TabsTrigger>
          <TabsTrigger value="incoming" className="text-xs sm:text-sm">{t.companions.sharedWithMe}</TabsTrigger>
          <TabsTrigger value="outgoing" className="text-xs sm:text-sm">{t.companions.myShares}</TabsTrigger>
        </TabsList>
        <TabsContent value="companions" className="space-y-4">
          <form onSubmit={request} className="space-y-2">
            <Label htmlFor={emailId}>{t.companions.email}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={emailId} type="email" required value={email} disabled={action.isPending}
                placeholder="namn@example.com" autoComplete="email" aria-invalid={!!requestError}
                aria-describedby={requestError ? `${emailId}-error` : undefined}
                onChange={event => { setEmail(event.target.value); setRequestError(''); }} />
              <Button type="submit" disabled={!email.trim() || action.isPending} className="gap-2">
                {action.isPending && action.variables.kind === 'request' && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.companions.request}
              </Button>
            </div>
            {requestError && <p id={`${emailId}-error`} role="alert" className="text-sm text-destructive">{requestError}</p>}
          </form>

          {companions.isPending ? <p role="status" className="text-sm text-muted-foreground">{t.common.loading}</p>
            : companions.isError ? <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{t.companions.loadFailed}</p>
              <Button variant="outline" size="sm" onClick={() => companions.refetch()}>{t.sharing.retry}</Button>
            </div>
            : !friends.length ? <p className="text-sm text-muted-foreground">{t.companions.empty}</p>
            : <ul className="space-y-3">
              {friends.map(friend => <li key={friend.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{friend.display_name || friend.email}</p>
                    {friend.display_name && <p className="text-xs text-muted-foreground break-all">{friend.email}</p>}
                    {friend.status === 'pending' && <p className="text-xs text-muted-foreground">{friend.incoming ? t.companions.incomingRequest : t.companions.pending}</p>}
                    {friend.receiving_all && <p className="text-xs text-primary">{t.companions.receivesAll}</p>}
                  </div>
                  {friend.status === 'accepted' && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={action.isPending} aria-label={`${t.companions.remove}: ${friend.email}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>{t.companions.remove}: {friend.email}</AlertDialogTitle>
                        <AlertDialogDescription>{t.companions.removeDescription}</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => action.mutate({ kind: 'remove', id: friend.id })}>{t.companions.remove}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                </div>
                {friend.status === 'accepted' ? <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`share-all-${friend.id}`}>{t.companions.shareAll}</Label>
                    <Switch id={`share-all-${friend.id}`} checked={friend.sharing_all} disabled={action.isPending}
                      aria-label={`${t.companions.shareAll}: ${friend.email}`}
                      onCheckedChange={enabled => action.mutate({ kind: 'all', userId: friend.user_id, enabled })} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t.companions.shareAllDescription}</p>
                  {friend.sharing_all && <p className="text-xs text-muted-foreground">{t.companions.stopAllDescription}</p>}
                </div> : <div className="flex flex-wrap gap-2">
                  {friend.incoming ? <>
                    <Button size="sm" disabled={action.isPending} className="gap-1" onClick={() => action.mutate({ kind: 'respond', id: friend.id, accept: true })}>
                      <Check className="h-4 w-4" />{t.companions.accept}
                    </Button>
                    <Button size="sm" variant="outline" disabled={action.isPending} className="gap-1" onClick={() => action.mutate({ kind: 'respond', id: friend.id, accept: false })}>
                      <X className="h-4 w-4" />{t.companions.decline}
                    </Button>
                  </> : <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ kind: 'remove', id: friend.id })}>{t.companions.cancelRequest}</Button>}
                </div>}
              </li>)}
            </ul>}
        </TabsContent>
        <TabsContent value="incoming">{sharedContent('incoming')}</TabsContent>
        <TabsContent value="outgoing">{sharedContent('outgoing')}</TabsContent>
      </Tabs>
    </CardContent>
  </Card>;
}
