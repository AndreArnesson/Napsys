import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Improvement = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
};

export default function Improvements() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const queryKey = ['improvements', user?.id];

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  // Fetch improvements
  const { data: improvements, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('improvements')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Improvement[];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase
        .from('improvements')
        .insert({ user_id: user!.id, title });
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      setNewTitle('');
      toast.success(t.common.success);
    },
    onError: () => {
      toast.error(t.common.error);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('improvements')
        .update({ done })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast.error(t.common.error);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('improvements')
        .update({ title })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      setEditingId(null);
      toast.success(t.common.success);
    },
    onError: () => {
      toast.error(t.common.error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('improvements')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      toast.success(t.common.success);
    },
    onError: () => {
      toast.error(t.common.error);
    },
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold">{t.improvements.title}</h1>

        {/* Add improvement */}
        <Card>
          <CardContent className="py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTitle.trim()) return;
                addMutation.mutate(newTitle.trim());
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t.improvements.addPlaceholder}
                className="flex-1"
              />
              <Button type="submit" size="sm" className="gap-2" disabled={addMutation.isPending}>
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t.improvements.submit}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Improvement list */}
        {improvements && improvements.length > 0 ? (
          <ul className="space-y-2">
            {improvements.map((item) => (
              <li key={item.id} className="group">
                <Card>
                  <CardContent className="py-3">
                    {editingId === item.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editValue.trim()) return;
                          editMutation.mutate({ id: item.id, title: editValue.trim() });
                        }}
                        className="flex items-center gap-2"
                      >
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={t.improvements.editPlaceholder}
                          autoFocus
                          className="flex-1"
                        />
                        <Button type="submit" size="sm" disabled={editMutation.isPending}>
                          OK
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          ✕
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: item.id, done: !!checked })
                          }
                        />
                        <span
                          className={`flex-1 ${item.done ? 'line-through text-muted-foreground' : ''}`}
                        >
                          {item.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditValue(item.title);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{item.title}</AlertDialogTitle>
                              <AlertDialogDescription>{t.improvements.confirmDescription}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate(item.id)}
                              >
                                {t.common.delete}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <p>{t.improvements.empty}</p>
              <p className="text-sm">{t.improvements.emptyDescription}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}