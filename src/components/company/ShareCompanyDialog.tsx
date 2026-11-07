import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useStockCompanions, refreshCompanionSharing } from '@/hooks/useStockCompanions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function ShareCompanyDialog({ companyId, companyName, ownerId }: {
  companyId: string;
  companyName: string;
  ownerId: string;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [companionId, setCompanionId] = useState('');
  const [shareAll, setShareAll] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const isOwner = !!user && user.id === ownerId;
  const companions = useStockCompanions(open && isOwner);
  const accepted = companions.data?.filter(friend => friend.status === 'accepted') ?? [];
  const selected = accepted.find(friend => friend.user_id === companionId);
  const shares = useQuery({
    queryKey: ['company-shares', companyId, user?.id],
    enabled: open && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from('shares')
        .select('id, shared_with_email, shared_with_user_id')
        .eq('company_id', companyId).order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const share = useMutation({
    mutationFn: async ({ recipientId, all }: { recipientId: string; all: boolean }) => {
      const { error } = all
        ? await supabase.rpc('set_companion_share_all', { _companion_id: recipientId, _enabled: true })
        : await supabase.rpc('share_company_with_companion', { _company_id: companyId, _companion_id: recipientId });
      if (error) throw error;
    },
    onSuccess: async (_data, { all }) => {
      setCompanionId('');
      setShareAll(false);
      setSubmitError('');
      toast.success(all ? t.companions.shareAllSuccess : t.sharing.shareSuccess);
      await refreshCompanionSharing(queryClient);
    },
    onError: () => setSubmitError(t.companions.actionFailed),
  });

  const revoke = useMutation({
    mutationFn: async (shareId: string) => {
      const { data, error } = await supabase.from('shares').delete()
        .eq('id', shareId).eq('company_id', companyId).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success(t.sharing.revokeSuccess);
      await refreshCompanionSharing(queryClient);
    },
    onError: () => toast.error(t.sharing.revokeFailed),
  });

  if (!isOwner) return null;

  // Removing an individual grant cannot revoke access provided by a global grant.
  const globalRecipients = accepted.filter(friend => friend.sharing_all);
  const recipients = [
    ...(shares.data ?? []).filter(grant => !globalRecipients.some(friend => friend.user_id === grant.shared_with_user_id))
      .map(grant => ({ id: grant.id, email: grant.shared_with_email, all: false })),
    ...globalRecipients.map(friend => ({ id: friend.id, email: friend.email, all: true })),
  ];
  const loading = shares.isPending || companions.isPending;
  const loadFailed = shares.isError || companions.isError;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.sharing_all || share.isPending) return;
    setSubmitError('');
    share.mutate({ recipientId: selected.user_id, all: shareAll });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setSubmitError(''); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Share2 className="h-4 w-4" />{t.sharing.share}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.sharing.share}: {companyName}</DialogTitle>
          <DialogDescription>{t.sharing.description}</DialogDescription>
        </DialogHeader>
        {accepted.length > 0 && <form onSubmit={submit} className="space-y-3">
          <Label htmlFor={fieldId}>{t.companions.select}</Label>
          <select id={fieldId} value={selected ? companionId : ''} disabled={share.isPending}
            onChange={event => { setCompanionId(event.target.value); setSubmitError(''); }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required aria-invalid={!!submitError} aria-describedby={submitError ? `${fieldId}-error` : undefined}>
            <option value="" disabled>{t.companions.choose}</option>
            {accepted.map(friend => <option key={friend.id} value={friend.user_id} disabled={friend.sharing_all}>
              {friend.display_name ? `${friend.display_name} (${friend.email})` : friend.email}
              {friend.sharing_all ? ` — ${t.companions.allAccess}` : ''}
            </option>)}
          </select>
          <div className="flex items-start gap-2">
            <Checkbox id={`${fieldId}-all`} checked={shareAll} disabled={share.isPending}
              onCheckedChange={checked => setShareAll(checked === true)} className="mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-all`}>{t.companions.shareAll}</Label>
              {shareAll && <p className="text-xs text-muted-foreground">{t.companions.shareAllDescription}</p>}
            </div>
          </div>
          <Button type="submit" disabled={!selected || selected.sharing_all || share.isPending} className="gap-2">
            {share.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t.sharing.share}
          </Button>
          {submitError && <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">{submitError}</p>}
        </form>}
        {!companions.isPending && !companions.isError && accepted.length === 0
          && <p className="text-sm text-muted-foreground">{t.companions.noAccepted}</p>}
        <Link to="/settings#stock-companions" className="text-sm text-primary hover:underline">{t.companions.manage}</Link>
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{t.sharing.sharedWith}</h3>
          {loading ? <p role="status" className="text-sm text-muted-foreground">{t.common.loading}</p>
            : loadFailed ? <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{t.sharing.loadFailed}</p>
              <Button variant="outline" size="sm" onClick={() => { shares.refetch(); companions.refetch(); }}>{t.sharing.retry}</Button>
            </div>
            : !recipients.length ? <p className="text-sm text-muted-foreground">{t.sharing.noShares}</p>
            : <ul className="max-h-64 space-y-2 overflow-y-auto">
              {recipients.map(recipient => (
                <li key={recipient.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm">{recipient.email}</p>
                    <p className="text-xs text-muted-foreground">{recipient.all ? t.companions.allAccess : t.sharing.readOnly}</p>
                  </div>
                  {!recipient.all && <Button variant="ghost" size="icon" disabled={revoke.isPending}
                    aria-label={`${t.sharing.revoke}: ${recipient.email}`} onClick={() => revoke.mutate(recipient.id)}>
                    {revoke.isPending && revoke.variables === recipient.id
                      ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>}
                </li>
              ))}
            </ul>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
