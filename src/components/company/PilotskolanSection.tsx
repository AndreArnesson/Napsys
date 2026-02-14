import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap } from 'lucide-react';

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Pilotskolan
        </CardTitle>
        <CardDescription>Dina tankar om insiders ägande och incitament</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          placeholder="Skriv dina tankar om insiders ägande, hur det påverkar bolaget, incitamentsstrukturer..."
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          disabled={readOnly}
          className="min-h-[120px]"
        />
      </CardContent>
    </Card>
  );
}
