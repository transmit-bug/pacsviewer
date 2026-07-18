# ADR-005: DICOM 网络协议实现

## 状态

已接受

## 背景

临床 PACS 系统需要与其他医疗设备和系统互联。DICOM 网络协议是标准通信方式：

- **C-STORE**：接收设备推送的 DICOM 图像
- **C-FIND**：查询 Worklist（待检查患者列表）
- **C-ECHO**：连通性测试（心跳）

这些协议基于 DICOM Upper Layer Protocol（ULP），运行在 TCP 之上。

## 决策

**使用 Bun 的 `net` 模块实现 DICOM ULP，不引入第三方 DICOM 网络库。**

### 协议栈

```
┌─────────────────────────┐
│   DICOM 应用层           │
│   C-STORE / C-FIND / ... │
├─────────────────────────┤
│   DICOM 消息层           │
│   P-DATA / DIMSE         │
├─────────────────────────┤
│   DICOM 上层协议 (ULP)   │
│   A-ASSOCIATE / P-DATA   │
│   A-RELEASE / A-ABORT    │
├─────────────────────────┤
│   TCP (Bun net 模块)     │
└─────────────────────────┘
```

### PDU 类型

| PDU 类型 | 代码 | 用途 |
|---|---|---|
| A-ASSOCIATE-RQ | 0x01 | 连接请求 |
| A-ASSOCIATE-AC | 0x02 | 连接接受 |
| A-ASSOCIATE-RJ | 0x03 | 连接拒绝 |
| P-DATA-TF | 0x04 | 数据传输 |
| A-RELEASE-RQ | 0x05 | 释放请求 |
| A-RELEASE-RP | 0x06 | 释放响应 |
| A-ABORT | 0x07 | 中止连接 |

### 实现范围

1. **Association 管理**：A-ASSOCIATE 握手、协商传输语法
2. **C-STORE SCP**：接收 DICOM 文件 → 解析 → 存储 → 入库
3. **C-FIND SCP**：响应 Worklist 查询，从数据库返回患者列表
4. **C-ECHO SCP**：响应心跳请求

### 代码规模估算

| 模块 | 估算行数 |
|---|---|
| PDU 解析器 | ~200 行 |
| Association 管理 | ~200 行 |
| C-STORE 处理 | ~150 行 |
| C-FIND 处理 | ~100 行 |
| C-ECHO 处理 | ~50 行 |
| **合计** | **~700 行** |

### 默认端口

```
DICOM SCP: 11112 (可配置)
```

## 理由

1. **Bun 原生**：`net` 模块完全支持 TCP 服务器
2. **协议固定**：DICOM ULP 的 PDU 格式是固定的二进制结构，不需要复杂的解析库
3. **无外部依赖**：避免引入 dicom-node、dcm4che 等重量级库
4. **可控性强**：自研实现可以精确控制性能和错误处理
5. **代码量可控**：~700 行 TypeScript 可以覆盖核心功能

## 后果

- 需要实现二进制 PDU 解析器（Bun Buffer 操作）
- 需要处理 DICOM 传输语法协商（隐式/显式 VR、压缩格式）
- 需要实现 DICOM UID 注册和管理
- 需要配置防火墙规则开放 DICOM 端口
- 不支持 TLS 加密（初期），后续可扩展
