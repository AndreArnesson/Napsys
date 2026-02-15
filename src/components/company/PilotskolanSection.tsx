import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

interface PilotskolanSectionProps {
  value: string;
  onUpdate: (value: string) => void;
  readOnly?: boolean;
}

export function PilotskolanSection({ value, onUpdate, readOnly = false }: PilotskolanSectionProps) {
  const [local, setLocal] = useState(value);

  const handleBlur = () => {
    if (local !== value) onUpdate(local);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-semibold">
        <GraduationCap className="h-5 w-5" />
        Pilotskolan
      </div>
      <p className="text-sm text-muted-foreground">Dina tankar om insiders ägande och incitament</p>
      <RichTextEditor
        value={local}
        onChange={setLocal}
        onBlur={handleBlur}
        placeholder="Skriv dina tankar om insiders ägande, hur det påverkar bolaget, incitamentsstrukturer..."
        disabled={readOnly}
      />
    </div>
  );
}