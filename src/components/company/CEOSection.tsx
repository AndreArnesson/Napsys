import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { supabase } from '@/integrations/supabase/client';

interface CEOData {
  name: string;
  since?: string;
  background?: string;
  compensation?: string;
  ownership?: string;
  notes?: string;
}

interface CEOSectionProps {
  ceo: CEOData;
  onUpdate: (ceo: CEOData) => void;
  companyId: string;
  readOnly?: boolean;
}

export function CEOSection({ ceo, onUpdate, companyId, readOnly = false }: CEOSectionProps) {
  const { t } = useLanguage();
  const [localCeo, setLocalCeo] = useState<CEOData>(ceo);

  const localCeoRef = useRef(localCeo);
  const ceoRef = useRef(ceo);
  useEffect(() => { localCeoRef.current = localCeo; }, [localCeo]);
  useEffect(() => { ceoRef.current = ceo; }, [ceo]);
  useEffect(() => {
    return () => {
      if (JSON.stringify(localCeoRef.current) !== JSON.stringify(ceoRef.current)) {
        supabase
          .from('companies')
          .update({ management: JSON.stringify(localCeoRef.current) })
          .eq('id', companyId)
          .then();
      }
    };
  }, []);

  const handleChange = (field: keyof CEOData, value: string) => {
    const updated = { ...localCeo, [field]: value };
    setLocalCeo(updated);
  };

  const handleBlur = () => {
    if (JSON.stringify(localCeo) !== JSON.stringify(ceo)) {
      onUpdate(localCeo);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-semibold">
        <User className="h-5 w-5" />
        CEO
      </div>
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg bg-primary/10 text-primary">
            {localCeo.name ? getInitials(localCeo.name) : <User className="h-6 w-6" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="CEO name" value={localCeo.name} onChange={(e) => handleChange('name', e.target.value)} onBlur={handleBlur} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>CEO since</Label>
              <Input placeholder="e.g. 2020" value={localCeo.since || ''} onChange={(e) => handleChange('since', e.target.value)} onBlur={handleBlur} disabled={readOnly} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Ownership (%)</Label>
          <Input placeholder="e.g. 5.2%" value={localCeo.ownership || ''} onChange={(e) => handleChange('ownership', e.target.value)} onBlur={handleBlur} disabled={readOnly} />
        </div>
        <div className="space-y-2">
          <Label>Compensation (yearly)</Label>
          <Input placeholder="e.g. 3 500 000 SEK" value={localCeo.compensation || ''} onChange={(e) => handleChange('compensation', e.target.value)} onBlur={handleBlur} disabled={readOnly} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Background</Label>
        <RichTextEditor
          value={localCeo.background || ''}
          onChange={(val) => handleChange('background', val)}
          onBlur={handleBlur}
          placeholder="Previous roles, education, experience..."
          minHeight="80px"
          disabled={readOnly}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <RichTextEditor
          value={localCeo.notes || ''}
          onChange={(val) => handleChange('notes', val)}
          onBlur={handleBlur}
          placeholder="Your notes about the CEO..."
          minHeight="60px"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
