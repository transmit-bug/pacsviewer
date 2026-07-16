import { useState, useEffect } from 'react';
import { deviceApi, transferApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Monitor,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  HardDrive,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  adapterId: string;
  connectionInfo?: Record<string, any>;
  status: 'online' | 'offline' | 'error';
  lastSyncAt?: string;
  imageCount: number;
  createdAt: string;
}

interface Transfer {
  id: string;
  deviceId?: string;
  adapterId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileCount: number;
  processedCount: number;
  errorCount: number;
  metadata?: Record<string, any>;
  createdAt: string;
  completedAt?: string;
  device?: Device;
}

const statusConfig = {
  online: { icon: Wifi, color: 'text-green-500', bg: 'bg-green-500/10', label: '在线' },
  offline: { icon: WifiOff, color: 'text-gray-500', bg: 'bg-gray-500/10', label: '离线' },
  error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', label: '错误' },
};

const transferStatusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', label: '等待中' },
  processing: { icon: Loader2, color: 'text-blue-500', label: '处理中' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: '已完成' },
  failed: { icon: XCircle, color: 'text-red-500', label: '失败' },
};

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceTransfers, setDeviceTransfers] = useState<Transfer[]>([]);
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'oct',
    manufacturer: '',
    model: '',
    serialNumber: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [devicesRes, transfersRes] = await Promise.all([
        deviceApi.getAll(),
        transferApi.getAll({ pageSize: 50 }),
      ]);
      setDevices(devicesRes.data?.items || devicesRes.data || []);
      setTransfers(transfersRes.data?.items || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async () => {
    try {
      await deviceApi.create(newDevice);
      setAddDialogOpen(false);
      setNewDevice({ name: '', type: 'oct', manufacturer: '', model: '', serialNumber: '' });
      loadData();
    } catch (error) {
      console.error('Failed to add device:', error);
    }
  };

  const handleViewDeviceTransfers = async (device: Device) => {
    setSelectedDevice(device);
    try {
      const response = await deviceApi.getTransfers(device.id);
      setDeviceTransfers(response.data || []);
    } catch (error) {
      console.error('Failed to load device transfers:', error);
      setDeviceTransfers([]);
    }
  };

  const handleRetryTransfer = async (transferId: string) => {
    try {
      await transferApi.retry(transferId);
      loadData();
      if (selectedDevice) {
        handleViewDeviceTransfers(selectedDevice);
      }
    } catch (error) {
      console.error('Failed to retry transfer:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Monitor className="h-8 w-8" />
            设备管理
          </h1>
          <p className="text-muted-foreground mt-1">管理成像设备和图像传输</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加设备
        </Button>
      </div>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">设备列表 ({devices.length})</TabsTrigger>
          <TabsTrigger value="transfers">传输记录 ({transfers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : devices.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">暂无设备</p>
                <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  添加第一台设备
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => {
                const config = statusConfig[device.status];
                const StatusIcon = config.icon;
                return (
                  <Card
                    key={device.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleViewDeviceTransfers(device)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{device.name}</CardTitle>
                        <span className={cn('flex items-center gap-1 text-xs', config.color)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {config.label}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">类型</span>
                          <Badge variant="outline">{device.type}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">厂商</span>
                          <span>{device.manufacturer}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">型号</span>
                          <span>{device.model}</span>
                        </div>
                        {device.serialNumber && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">序列号</span>
                            <span className="font-mono text-xs">{device.serialNumber}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <HardDrive className="h-3.5 w-3.5" />
                            图像数
                          </span>
                          <span className="font-medium">{device.imageCount}</span>
                        </div>
                        {device.lastSyncAt && (
                          <div className="text-xs text-muted-foreground">
                            最后同步: {new Date(device.lastSyncAt).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transfers">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : transfers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowUpDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">暂无传输记录</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {transfers.map((transfer) => {
                    const config = transferStatusConfig[transfer.status];
                    const TIcon = config.icon;
                    const progress = transfer.fileCount > 0
                      ? Math.round((transfer.processedCount / transfer.fileCount) * 100)
                      : 0;
                    return (
                      <div key={transfer.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <span className={cn('flex items-center gap-1 text-sm', config.color)}>
                            <TIcon className={cn('h-4 w-4', transfer.status === 'processing' && 'animate-spin')} />
                            {config.label}
                          </span>
                          <div className="text-sm">
                            <div className="font-medium">
                              {transfer.processedCount} / {transfer.fileCount} 文件
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(transfer.createdAt).toLocaleString('zh-CN')}
                              {transfer.device && ` • ${transfer.device.name}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {transfer.status !== 'pending' && (
                            <div className="w-24">
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    transfer.status === 'completed' ? 'bg-green-500' :
                                    transfer.status === 'failed' ? 'bg-red-500' :
                                    'bg-blue-500'
                                  )}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground text-center mt-0.5">
                                {progress}%
                              </div>
                            </div>
                          )}
                          {transfer.status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetryTransfer(transfer.id)}
                            >
                              <RefreshCw className="mr-1.5 h-3 w-3" />
                              重试
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加设备</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>设备名称</Label>
              <Input
                value={newDevice.name}
                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                placeholder="例如: 3楼 OCT-1"
              />
            </div>
            <div>
              <Label>设备类型</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newDevice.type}
                onChange={(e) => setNewDevice({ ...newDevice, type: e.target.value })}
              >
                <option value="oct">OCT</option>
                <option value="fundus_camera">眼底相机</option>
                <option value="ffa">FFA</option>
                <option value="icga">ICGA</option>
                <option value="vf">视野计</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <Label>厂商</Label>
              <Input
                value={newDevice.manufacturer}
                onChange={(e) => setNewDevice({ ...newDevice, manufacturer: e.target.value })}
                placeholder="例如: Zeiss, Topcon, Canon"
              />
            </div>
            <div>
              <Label>型号</Label>
              <Input
                value={newDevice.model}
                onChange={(e) => setNewDevice({ ...newDevice, model: e.target.value })}
                placeholder="例如: CIRRUS HD-OCT"
              />
            </div>
            <div>
              <Label>序列号</Label>
              <Input
                value={newDevice.serialNumber}
                onChange={(e) => setNewDevice({ ...newDevice, serialNumber: e.target.value })}
                placeholder="可选"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleAddDevice} disabled={!newDevice.name || !newDevice.manufacturer || !newDevice.model}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Device Transfers Dialog */}
      <Dialog open={!!selectedDevice} onOpenChange={(open) => !open && setSelectedDevice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDevice?.name} — 传输记录
            </DialogTitle>
          </DialogHeader>
          {deviceTransfers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无传输记录</div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {deviceTransfers.map((transfer) => {
                const config = transferStatusConfig[transfer.status];
                const TIcon = config.icon;
                return (
                  <div key={transfer.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-2">
                      <TIcon className={cn('h-4 w-4', config.color, transfer.status === 'processing' && 'animate-spin')} />
                      <div>
                        <div className="text-sm font-medium">
                          {transfer.processedCount} / {transfer.fileCount} 文件
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(transfer.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={config.color}>
                        {config.label}
                      </Badge>
                      {transfer.status === 'failed' && (
                        <Button variant="outline" size="sm" onClick={() => handleRetryTransfer(transfer.id)}>
                          <RefreshCw className="mr-1 h-3 w-3" />
                          重试
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
