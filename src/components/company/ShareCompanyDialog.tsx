import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState('');
  const isOwner = !!user && user.id === ownerId;
  const queryKey = ['company-shares', companyId, user?.id];
  const shares = useQuery({
    queryKey,
    enabled: open && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from('shares')
        .select('id, shared_with_email, shared_with_user_id')
        .eq('company_id', companyId).order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const refreshShares = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['shared-companies'] });
  };

  const share = useMutation({
    mutationFn: async (recipient: string) => {
      const { error } = await supabase.rpc('share_company_with_email', {
        _company_id: companyId,
        _email: recipient,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setEmail('');
      setSubmitError('');
      toast.success(t.sharing.shareSuccess);
      await refreshShares();
    },
    onError: (error: { code?: string }) => {
      setSubmitError(error.code === 'P0002' ? t.sharing.userNotFound
        : error.code === '22023' ? t.sharing.cannotShareWithSelf
        : error.code === '42501' ? t.sharing.ownerOnly
        : t.sharing.shareFailed);
    },
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
      await refreshShares();
    },
    onError: () => toast.error(t.sharing.revokeFailed),
  });

  if (!isOwner) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || share.isPending) return;
    setSubmitError('');
    share.mutate(email.trim().toLowerCase());
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
        <form onSubmit={submit} className="space-y-3">
          <Label htmlFor={emailId}>{t.sharing.email}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id={emailId} type="email" required autoComplete="email" value={email}
              onChange={(event) => { setEmail(event.target.value); setSubmitError(''); }}
              placeholder="namn@example.com" disabled={share.isPending}
              aria-invalid={!!submitError} aria-describedby={submitError ? `${emailId}-error` : undefined} />
            <Button type="submit" disabled={!email.trim() || share.isPending} className="gap-2">
              {share.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t.sharing.share}
            </Button>
          </div>
          {submitError && <p id={`${emailId}-error`} role="alert" className="text-sm text-destructive">{submitError}</p>}
        </form>
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{t.sharing.sharedWith}</h3>
          {shares.isPending ? <p role="status" className="text-sm text-muted-foreground">{t.common.loading}</p>
            : shares.isError ? <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{t.sharing.loadFailed}</p>
              <Button variant="outline" size="sm" onClick={() => shares.refetch()}>{t.sharing.retry}</Button>
            </div>
            : !shares.data?.length ? <p className="text-sm text-muted-foreground">{t.sharing.noShares}</p>
            : <ul className="max-h-64 space-y-2 overflow-y-auto">
              {shares.data.map((recipient) => (
                <li key={recipient.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm">{recipient.shared_with_email}</p>
                    <p className="text-xs text-muted-foreground">{t.sharing.readOnly}</p>
                  </div>
                  <Button variant="ghost" size="icon" disabled={revoke.isPending}
                    aria-label={`${t.sharing.revoke}: ${recipient.shared_with_email}`}
                    onClick={() => revoke.mutate(recipient.id)}>
                    {revoke.isPending && revoke.variables === recipient.id
                      ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </li>
              ))}
            </ul>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
