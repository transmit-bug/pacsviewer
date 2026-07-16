import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { patientApi, studyApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { ArrowLeft, Save } from 'lucide-react';

export function StudyCreatePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studyId, setStudyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    modality: 'OCT',
    description: '',
    studyDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (patientId) {
      loadPatient(patientId);
    }
  }, [patientId]);

  const loadPatient = async (id: string) => {
    try {
      const response = await patientApi.getById(id);
      setPatient(response.data);
    } catch (error) {
      console.error('Failed to load patient:', error);
      toast({
        title: '加载患者信息失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudy = async () => {
    if (!patientId) return;

    try {
      setSaving(true);
      const response = await studyApi.create({
        patientId,
        modality: formData.modality,
        description: formData.description || `${formData.modality} 检查`,
        studyDate: formData.studyDate,
        status: 'pending',
      });
      setStudyId(response.data.id);
      toast({
        title: '检查创建成功',
        description: '现在可以上传图像了。',
      });
    } catch (error) {
      console.error('Failed to create study:', error);
      toast({
        title: '创建检查失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadComplete = (imageIds: string[]) => {
    toast({
      title: `成功上传 ${imageIds.length} 张图像`,
    });
  };

  const handleFinish = () => {
    if (studyId) {
      navigate(`/viewer/${studyId}`);
    } else {
      navigate(`/patients/${patientId}`);
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
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">患者未找到</p>
        <Button asChild variant="outline">
          <Link to="/patients">返回患者列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/patients/${patientId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">新建检查</h1>
          <p className="text-sm text-muted-foreground">
            患者：{patient.name} ({patient.mrn})
          </p>
        </div>
      </div>

      {/* Step 1: Study Info */}
      {!studyId && (
        <Card>
          <CardHeader>
            <CardTitle>检查信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modality">检查类型</Label>
                <select
                  id="modality"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.modality}
                  onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                >
                  <option value="OCT">OCT</option>
                  <option value="Fundus">眼底彩照</option>
                  <option value="FFA">FFA 荧光造影</option>
                  <option value="ICGA">ICGA 吲哚菁绿造影</option>
                  <option value="VF">视野检查</option>
                  <option value="UBM">UBM</option>
                  <option value="B-Scan">B 超</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="studyDate">检查日期</Label>
                <Input
                  id="studyDate"
                  type="date"
                  value={formData.studyDate}
                  onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">检查描述</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="可选：输入检查描述"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreateStudy} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? '创建中...' : '创建检查'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload Images */}
      {studyId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>上传图像</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload
                studyId={studyId}
                patientId={patientId}
                onUploadComplete={handleUploadComplete}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleFinish}>
              稍后上传
            </Button>
            <Button onClick={handleFinish}>
              完成，查看检查
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
