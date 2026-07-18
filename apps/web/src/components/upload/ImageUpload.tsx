import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';
import { Upload, X, FileImage, CheckCircle, AlertCircle, FolderOpen, RotateCw } from 'lucide-react';
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  // Read dropped folder entries recursively
  const readDirectory = async (entry: any): Promise<File[]> => {
    const files: File[] = [];
    const reader = entry.createReader();
    
    const readBatch = (): Promise<any[]> => new Promise((resolve) => {
      reader.readEntries((entries: any[]) => resolve(entries));
    });
    
    let entries = await readBatch();
    while (entries.length > 0) {
      for (const e of entries) {
        if (e.isFile) {
          const file = await new Promise<File>((res) => e.file(res));
          files.push(file);
        } else if (e.isDirectory) {
          const subFiles = await readDirectory(e);
          files.push(...subFiles);
        }
      }
      entries = await readBatch();
    }
    return files;
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const items = Array.from(e.dataTransfer.items);
    const allFiles: File[] = [];
    
    for (const item of items) {
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) {
        if (entry.isFile) {
          const file = await new Promise<File>((res) => entry.file(res));
          allFiles.push(file);
        } else if (entry.isDirectory) {
          const dirFiles = await readDirectory(entry);
          allFiles.push(...dirFiles);
        }
      } else if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) allFiles.push(file);
      }
    }
    
    addFiles(allFiles);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const allowedExtensions = ['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
    
    // Check for DICOMDIR
    const dicomdir = newFiles.find(f => f.name.toUpperCase() === 'DICOMDIR');
    if (dicomdir) {
      toast({
        title: '检测到 DICOMDIR 文件',
        description: '将按照 DICOMDIR 目录结构组织文件',
      });
      // DICOMDIR processing would be handled by the server
    }

    const validFiles = newFiles.filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAllowedExt = allowedExtensions.includes(ext);
      const isAllowedType = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/webp',
        'image/tiff',
        'application/dicom',
        'application/octet-stream',
      ].includes(file.type);
      return isAllowedExt || isAllowedType || file.name.toUpperCase() === 'DICOMDIR';
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

  // Retry failed uploads
  const retryFailed = async () => {
    const failedFiles = files.filter((f) => f.status === 'error');
    if (failedFiles.length === 0) return;

    // Reset status to pending
    setFiles((prev) =>
      prev.map((f) =>
        f.status === 'error' ? { ...f, status: 'pending', error: undefined } : f
      )
    );

    // Upload after state update
    setTimeout(() => handleUploadAll(), 100);
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
  const errorCount = files.filter((f) => f.status === 'error').length;

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
          拖拽文件或文件夹到此处
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          支持 DICOM、JPEG、PNG、BMP、WebP、TIFF 格式，最多 {maxFiles} 个文件
        </p>
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <FileImage className="mr-2 h-4 w-4" />
            选择文件
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              const folderInput = document.createElement('input');
              folderInput.type = 'file';
              folderInput.webkitdirectory = true;
              folderInput.onchange = (ev) => {
                const target = ev.target as HTMLInputElement;
                if (target.files) {
                  addFiles(Array.from(target.files));
                }
              };
              folderInput.click();
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            选择文件夹
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif"
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
                {errorCount > 0 && `，${errorCount} 个失败`}
              </p>
              <div className="flex space-x-2">
                {errorCount > 0 && (
                  <Button variant="outline" size="sm" onClick={retryFailed}>
                    <RotateCw className="mr-2 h-3 w-3" />
                    重试失败
                  </Button>
                )}
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
