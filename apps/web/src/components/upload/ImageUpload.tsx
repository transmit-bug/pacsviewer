import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';
import { Upload, X, FileImage, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { imageApi } from '@/services/api';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface ImageUploadProps {
  studyId?: string;
  patientId?: string;
  onUploadComplete?: (imageIds: string[]) => void;
  maxFiles?: number;
  className?: string;
}

export function ImageUpload({
  studyId,
  patientId,
  onUploadComplete,
  maxFiles = 20,
  className,
}: ImageUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'application/dicom',
      'application/octet-stream',
    ];

    const validFiles = newFiles.filter((file) => {
      const ext = file.name.toLowerCase();
      return (
        allowedTypes.includes(file.type) ||
        ext.endsWith('.dcm') ||
        ext.endsWith('.dicom')
      );
    });

    if (validFiles.length + files.length > maxFiles) {
      toast({
        title: `最多只能上传 ${maxFiles} 个文件`,
        variant: 'destructive',
      });
      return;
    }

    const uploadFiles: UploadFile[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      progress: 0,
      status: 'pending',
    }));

    setFiles((prev) => [...prev, ...uploadFiles]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFile = async (uploadFile: UploadFile): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', uploadFile.file);
    if (studyId) formData.append('studyId', studyId);
    if (patientId) formData.append('patientId', patientId);

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f
        )
      );

      const response = await imageApi.upload(formData);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'success', progress: 100 } : f
        )
      );

      return response.data?.id || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'error', error: message } : f
        )
      );
      return null;
    }
  };

  const handleUploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    const results = await Promise.all(pendingFiles.map(uploadFile));
    const successIds = results.filter((id): id is string => id !== null);

    if (successIds.length > 0) {
      toast({
        title: `成功上传 ${successIds.length} 个文件`,
      });
      onUploadComplete?.(successIds);
    }

    const failedCount = pendingFiles.length - successIds.length;
    if (failedCount > 0) {
      toast({
        title: `${failedCount} 个文件上传失败`,
        variant: 'destructive',
      });
    }
  };

  const handleClearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'success'));
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50'
        )}
      >
        <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium mb-2">
          拖拽文件到此处或点击选择
        </p>
        <p className="text-sm text-muted-foreground">
          支持 DICOM、JPEG、PNG、BMP、WebP 格式，最多 {maxFiles} 个文件
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom,.jpg,.jpeg,.png,.gif,.bmp,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center space-x-3 p-2 rounded-lg bg-muted/50"
                >
                  <FileImage className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {file.status === 'uploading' && (
                      <Progress value={file.progress} className="h-1 mt-1" />
                    )}
                    {file.status === 'error' && (
                      <p className="text-xs text-destructive mt-1">{file.error}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {file.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {file.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    {file.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {pendingCount} 个待上传，{successCount} 个已完成
              </p>
              <div className="flex space-x-2">
                {successCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearCompleted}>
                    清除已完成
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleUploadAll}
                  disabled={pendingCount === 0}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  上传全部
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
