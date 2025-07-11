# 文件上传任务调度器

## 后端接口

### 1.秒传：/file/sec-upload POST

```markdown
payload {
    "filename": "mysql-8.0.27.tar",
    "identifier": "05085dcad7ffc8d71e59e112033d5a50",
    "parentId": "aJ3M/5WiHaW+jSzEOKdwZQ=="
}
响应成功：{ code: 0 }
```

### 2.秒传失败后查询已上传的分片：/file/chunk-upload GET
```markdown
payload {
    "chunkNumber": "1",
    "chunkSize": "2097152",
    "currentChunkSize": "2097152",
    "totalSize": "521015808",
    "identifier": "05085dcad7ffc8d71e59e112033d5a50",
    "filename": "mysql-8.0.27.tar",
    "relativePath": "mysql-8.0.27.tar",
    "totalChunks": "248",
    "parentId": "aJ3M/5WiHaW+jSzEOKdwZQ=="
}
响应格式：{
    "uploadedChunks": [
        2,
        3,
        4,
        5,
        6
    ]
}
```

### 3.分片上传：/file/chunk-upload POST
```markdown
payload（FormData 格式） {
    "chunkNumber": 10,
    "chunkSize": 2097152,
    "currentChunkSize": 2097152,
    "totalSize": 521015808,
    "identifier": "05085dcad7ffc8d71e59e112033d5a50",
    "filename": "mysql-8.0.27.tar",
    "relativePath": "mysql-8.0.27.tar",
    "totalChunks": 248,
    "parentId": "aJ3M/5WiHaW+jsZEOKdwZQ==",
    "file": "(binary)"
}
响应格式：{
    "mergeFlag": 0 // 当 mergeFlag = 1 时，触发合并分片接口
}
```

### 4.分片合并：/file/merge POST
```markdown
payload {
    "filename": "mysql-8.0.27.tar",
    "identifier": "05085dcad7ffc8d71e59e112033d5a50",
    "parentId": "aJ3M/5WiHaW+jSzEOKdwZQ==",
    "totalSize": 521015808
}
响应格式：{
    "code": 0
}
```
