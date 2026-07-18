import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ArrowLeft, Save } from 'lucide-react';

interface PatientFormData {
  mrn: string;
  name: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string[];
}

export function PatientFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isEdit = !!id;
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [formData, setFormData] = useState<PatientFormData>({
    mrn: '',
    name: '',
    gender: 'male',
    birthDate: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    tags: [],
  });

  useEffect(() => {
    if (isEdit) {
      loadPatient();
    }
  }, [id]);

  const loadPatient = async () => {
    try {
      setLoading(true);
      const response = await patientApi.getById(id!);
      const patient = response.data;
      setFormData({
        mrn: patient.mrn || '',
        name: patient.name || '',
        gender: patient.gender || 'male',
        birthDate: patient.birthDate || '',
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        notes: patient.notes || '',
        tags: patient.tags || [],
      });
    } catch (error) {
      console.error('Failed to load patient:', error);
      toast({
        title: '加载失败',
        description: '无法加载患者信息，请稍后重试。',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof PatientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.mrn || !formData.name) {
      toast({
        title: '请填写必填字段',
        description: 'MRN 和姓名为必填项。',
        variant: 'destructive',
      });
      return;
    }

    // Prepare form data - convert empty strings to null for optional fields
    const submitData = {
      ...formData,
      birthDate: formData.birthDate || null,
      phone: formData.phone || null,
      email: formData.email || null,
      address: formData.address || null,
      notes: formData.notes || null,
    };

    try {
      setSaving(true);
      if (isEdit) {
        await patientApi.update(id!, submitData);
        toast({
          title: '更新成功',
          description: '患者信息已更新。',
        });
      } else {
        await patientApi.create(submitData);
        toast({
          title: '创建成功',
          description: '新患者已创建。',
        });
      }
      navigate('/patients');
    } catch (error) {
      console.error('Failed to save patient:', error);
      toast({
        title: isEdit ? '更新失败' : '创建失败',
        description: '操作失败，请稍后重试。',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-[200px]" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/patients">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">
          {isEdit ? '编辑患者' : '新增患者'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>患者信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {/* MRN */}
              <div className="space-y-2">
                <Label htmlFor="mrn">
                  {t('patient.mrn')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mrn"
                  value={formData.mrn}
                  onChange={(e) => handleChange('mrn', e.target.value)}
                  placeholder="例如: MRN-001"
                  required
                />
              </div>

              {/* 姓名 */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t('patient.name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="患者姓名"
                  required
                />
              </div>

              {/* 性别 */}
              <div className="space-y-2">
                <Label htmlFor="gender">{t('patient.gender')}</Label>
                <select
                  id="gender"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
                >
                  <option value="male">{t('patient.male')}</option>
                  <option value="female">{t('patient.female')}</option>
                </select>
              </div>

              {/* 出生日期 */}
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t('patient.birthDate')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => handleChange('birthDate', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="flex-1"
                  />
                  {formData.birthDate && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleChange('birthDate', '')}
                    >
                      清除
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  可选，不填则不记录出生日期
                </p>
              </div>

              {/* 电话 */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('patient.phone')}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="联系电话"
                />
              </div>

              {/* 邮箱 */}
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="电子邮箱"
                />
              </div>

              {/* 地址 */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">地址</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="家庭住址"
                />
              </div>

              {/* 备注 */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">备注</Label>
                <textarea
                  id="notes"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="其他备注信息"
                />
              </div>

              {/* 标签 */}
              <div className="space-y-2 md:col-span-2">
                <Label>标签</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="输入标签"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    添加
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" asChild>
                <Link to="/patients">取消</Link>
              </Button>
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
