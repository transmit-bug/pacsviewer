import { useState, useEffect } from 'react';
import { imageApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Search, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DicomTag {
  tag: string;
  vr: string;
  name: string;
  value: string;
}

interface DicomTagViewerProps {
  imageId: string;
  onClose: () => void;
  className?: string;
}

// Common DICOM tag names
const DICOM_TAG_NAMES: Record<string, string> = {
  '(0008,0005)': 'Specific Character Set',
  '(0008,0008)': 'Image Type',
  '(0008,0016)': 'SOP Class UID',
  '(0008,0018)': 'SOP Instance UID',
  '(0008,0020)': 'Study Date',
  '(0008,0021)': 'Series Date',
  '(0008,0030)': 'Study Time',
  '(0008,0031)': 'Series Time',
  '(0008,0050)': 'Accession Number',
  '(0008,0060)': 'Modality',
  '(0008,0070)': 'Manufacturer',
  '(0008,0080)': 'Institution Name',
  '(0008,0090)': 'Referring Physician Name',
  '(0008,1030)': 'Study Description',
  '(0008,103E)': 'Series Description',
  '(0010,0010)': 'Patient Name',
  '(0010,0020)': 'Patient ID',
  '(0010,0030)': 'Patient Birth Date',
  '(0010,0040)': 'Patient Sex',
  '(0010,1010)': 'Patient Age',
  '(0018,0015)': 'Body Part Examined',
  '(0018,0050)': 'Slice Thickness',
  '(0018,0060)': 'KVP',
  '(0018,0088)': 'Spacing Between Slices',
  '(0018,1030)': 'Protocol Name',
  '(0018,5100)': 'Patient Position',
  '(0018,5101)': 'View Position',
  '(0020,000D)': 'Study Instance UID',
  '(0020,000E)': 'Series Instance UID',
  '(0020,0010)': 'Study ID',
  '(0020,0011)': 'Series Number',
  '(0020,0013)': 'Instance Number',
  '(0020,0020)': 'Patient Orientation',
  '(0020,0032)': 'Image Position (Patient)',
  '(0020,0037)': 'Image Orientation (Patient)',
  '(0020,0052)': 'Frame of Reference UID',
  '(0020,1041)': 'Slice Location',
  '(0028,0002)': 'Samples per Pixel',
  '(0028,0004)': 'Photometric Interpretation',
  '(0028,0008)': 'Number of Frames',
  '(0028,0010)': 'Rows',
  '(0028,0011)': 'Columns',
  '(0028,0030)': 'Pixel Spacing',
  '(0028,0100)': 'Bits Allocated',
  '(0028,0101)': 'Bits Stored',
  '(0028,0102)': 'High Bit',
  '(0028,0103)': 'Pixel Representation',
  '(0028,1050)': 'Window Center',
  '(0028,1051)': 'Window Width',
  '(0028,1052)': 'Rescale Intercept',
  '(0028,1053)': 'Rescale Slope',
  '(0040,0244)': 'Performed Procedure Step Start Date',
  '(0040,0245)': 'Performed Procedure Step Start Time',
  '(0040,0253)': 'Performed Procedure Step ID',
  '(0040,0254)': 'Performed Procedure Step Description',
  '(7FE0,0010)': 'Pixel Data',
};

export function DicomTagViewer({ imageId, onClose, className }: DicomTagViewerProps) {
  const [tags, setTags] = useState<DicomTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();
  }, [imageId]);

  const loadMetadata = async () => {
    try {
      setLoading(true);
      const response = await imageApi.getMetadata(imageId);
      const metadata = response.data || {};
      
      // Convert metadata object to tags array
      const tagsArray: DicomTag[] = Object.entries(metadata).map(([tag, value]) => ({
        tag,
        vr: 'UN',
        name: DICOM_TAG_NAMES[tag] || tag,
        value: String(value),
      }));

      // Sort by tag
      tagsArray.sort((a, b) => a.tag.localeCompare(b.tag));
      setTags(tagsArray);
    } catch (error) {
      console.error('Failed to load DICOM metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTags = tags.filter((tag) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tag.tag.toLowerCase().includes(query) ||
      tag.name.toLowerCase().includes(query) ||
      tag.value.toLowerCase().includes(query)
    );
  });

  const handleCopyTag = (tag: string, value: string) => {
    navigator.clipboard.writeText(`${tag}: ${value}`);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">DICOM 标签</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Tags List */}
        <ScrollArea className="flex-1 px-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : filteredTags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {searchQuery ? '未找到匹配的标签' : '无 DICOM 标签数据'}
            </p>
          ) : (
            <div className="space-y-1 pb-4">
              {filteredTags.map((tag) => (
                <div
                  key={tag.tag}
                  className="flex items-start space-x-2 p-2 rounded hover:bg-accent/50 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <code className="text-xs font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                        {tag.tag}
                      </code>
                      <span className="text-xs text-muted-foreground">{tag.vr}</span>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{tag.name}</p>
                    <p className="text-sm text-muted-foreground truncate" title={tag.value}>
                      {tag.value || '-'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => handleCopyTag(tag.tag, tag.value)}
                  >
                    {copiedTag === tag.tag ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Summary */}
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          共 {filteredTags.length} 个标签
          {searchQuery && ` (筛选自 ${tags.length} 个)`}
        </div>
      </CardContent>
    </Card>
  );
}
