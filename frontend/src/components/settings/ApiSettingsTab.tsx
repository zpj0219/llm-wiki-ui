import { useState } from 'react';
import { Monitor, Network, CheckCircle2, Server, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { API_ENVIRONMENTS, type ApiEnvironment } from '@shared/constants';
import {
  addRemoteServer,
  deleteRemoteServer,
  getCurrentApiEnvironment,
  getRemoteServers,
  getApiBase,
  setApiEnvironment,
  setSelectedServerId,
  updateRemoteServer,
  type RemoteServer,
} from '@shared/utils/apiConfig';

export function ApiSettingsTab() {
  const [env, setEnv] = useState<ApiEnvironment>(() => getCurrentApiEnvironment());
  const [servers, setServers] = useState<RemoteServer[]>(() => getRemoteServers());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem('selectedServerId')
  );
  const [editing, setEditing] = useState<RemoteServer | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', apiBase: '' });

  const refresh = () => setServers(getRemoteServers());

  const handleEnvChange = (next: ApiEnvironment) => {
    setEnv(next);
    setApiEnvironment(next);
  };

  const openAdd = () => {
    setEditing('new');
    setForm({ name: '', apiBase: 'http://192.168.1.100:8000/api' });
  };

  const openEdit = (server: RemoteServer) => {
    setEditing(server);
    setForm({ name: server.name, apiBase: server.apiBase });
  };

  const saveForm = () => {
    if (!form.name.trim() || !form.apiBase.trim()) return;
    if (editing === 'new') {
      addRemoteServer({ name: form.name.trim(), apiBase: form.apiBase.trim() });
    } else if (editing) {
      updateRemoteServer(editing.id, { name: form.name.trim(), apiBase: form.apiBase.trim() });
    }
    setEditing(null);
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API 环境配置</CardTitle>
          <CardDescription>选择连接本机服务器或局域网服务器</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant="outline" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
            当前：{API_ENVIRONMENTS[env].label} · {getApiBase()}
          </Badge>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="button"
              variant={env === 'LOCAL' ? 'default' : 'outline'}
              className="h-auto py-3 px-4 justify-start"
              onClick={() => handleEnvChange('LOCAL')}
            >
              <Monitor className="h-5 w-5 mr-3 shrink-0" />
              <div className="text-left min-w-0">
                <div className="font-semibold text-sm">本机服务器</div>
                <div className="text-xs opacity-70 truncate">{API_ENVIRONMENTS.LOCAL.apiBase}</div>
              </div>
            </Button>
            <Button
              type="button"
              variant={env === 'REMOTE' ? 'default' : 'outline'}
              className="h-auto py-3 px-4 justify-start"
              onClick={() => handleEnvChange('REMOTE')}
            >
              <Network className="h-5 w-5 mr-3 shrink-0" />
              <div className="text-left min-w-0">
                <div className="font-semibold text-sm">局域网服务器</div>
                <div className="text-xs opacity-70">{servers.length} 台已配置</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {env === 'REMOTE' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">局域网服务器列表</CardTitle>
              <Button size="sm" variant="outline" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                添加
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {servers.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
                还没有添加服务器
              </div>
            ) : (
              servers.map((server) => (
                <div
                  key={server.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-colors ${
                    selectedId === server.id ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => {
                      setSelectedId(server.id);
                      setSelectedServerId(server.id);
                    }}
                  >
                    <div className="font-medium text-sm truncate">{server.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{server.apiBase}</div>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(server)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        deleteRemoteServer(server.id);
                        if (selectedId === server.id) setSelectedId(null);
                        refresh();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing === 'new' ? '添加服务器' : '编辑服务器'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>API 地址</Label>
              <Input
                value={form.apiBase}
                onChange={(e) => setForm({ ...form, apiBase: e.target.value })}
                placeholder="http://192.168.1.100:8000/api"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveForm}>保存</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
