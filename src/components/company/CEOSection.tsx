import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

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
  readOnly?: boolean;
}

export function CEOSection({ ceo, onUpdate, readOnly = false }: CEOSectionProps) {
  const { t } = useLanguage();
  const [localCeo, setLocalCeo] = useState<CEOData>(ceo);

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
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          CEO
        </CardTitle>
        <CardDescription>Chief Executive Officer information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <Input
                  placeholder="CEO name"
                  value={localCeo.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  onBlur={handleBlur}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>CEO since</Label>
                <Input
                  placeholder="e.g. 2020"
                  value={localCeo.since || ''}
                  onChange={(e) => handleChange('since', e.target.value)}
                  onBlur={handleBlur}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ownership (%)</Label>
            <Input
              placeholder="e.g. 5.2%"
              value={localCeo.ownership || ''}
              onChange={(e) => handleChange('ownership', e.target.value)}
              onBlur={handleBlur}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Compensation (yearly)</Label>
            <Input
              placeholder="e.g. 3 500 000 SEK"
              value={localCeo.compensation || ''}
              onChange={(e) => handleChange('compensation', e.target.value)}
              onBlur={handleBlur}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Background</Label>
          <Textarea
            placeholder="Previous roles, education, experience..."
            value={localCeo.background || ''}
            onChange={(e) => handleChange('background', e.target.value)}
            onBlur={handleBlur}
            disabled={readOnly}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            placeholder="Your notes about the CEO..."
            value={localCeo.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            onBlur={handleBlur}
            disabled={readOnly}
            className="min-h-[60px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
