import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { safeJsonArray } from '@/lib/utils';

interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender: string;
  birthDate: string;
  phone?: string;
  tags: string[];
}

export function PatientListPage() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const response = await patientApi.getAll();
      // API returns paginated data: { items: [...], total, page, pageSize, totalPages }
      setPatients(response.data?.items || []);
    } catch (error) {
      console.error('Failed to load patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadPatients();
      return;
    }
    try {
      setLoading(true);
      const response = await patientApi.search(searchQuery);
      // Search API returns array directly
      setPatients(response.data || []);
    } catch (error) {
      console.error('Failed to search patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个患者吗？')) return;
    try {
      await patientApi.delete(id);
      setPatients(patients.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete patient:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('nav.patients')}</h1>
        <Button asChild>
          <Link to="/patients/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('patient.add')}
          </Link>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder={t('patient.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>患者列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无患者数据
            </div>
          ) : (
            <div className="space-y-4">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <Link to={`/patients/${patient.id}`} className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        {patient.name[0]}
                      </div>
                      <div>
                        <p className="font-medium">{patient.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('patient.mrn')}: {patient.mrn} | {patient.gender === 'male' ? t('patient.male') : t('patient.female')} | {patient.birthDate}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center space-x-2">
                    {safeJsonArray(patient.tags).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/patients/${patient.id}`}>查看详情</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/patients/${patient.id}/edit`}>编辑</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(patient.id)}
                        >
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
