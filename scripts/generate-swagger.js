const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FFBox API',
      version: '5.3.0',
      description: 'FFBox 后端服务 API 文档',
      contact: {
        name: '滔滔清风',
        email: 'ttqf.tech@qq.com',
        url: 'http://ffbox.ttqf.tech'
      }
    },
    servers: [
      {
        url: 'http://localhost:33269',
        description: '默认本地服务器地址'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: '通过 /api/v1/auth/login 获取的 sessionId'
        }
      },
      schemas: {
        // ==================== 核心类型 ====================
        Task: {
          type: 'object',
          properties: {
            taskName: { type: 'string' },
            before: { type: 'array', items: { $ref: '#/components/schemas/InputInfo' } },
            after: { $ref: '#/components/schemas/OutputParams' },
            paraArray: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['deleted', 'initializing', 'idle', 'idle_queued', 'running', 'paused', 'paused_queued', 'stopping', 'finishing', 'finished', 'error'] },
            progressLog: {
              type: 'object',
              properties: {
                time: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                frame: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                size: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                lastStarted: { type: 'number' },
                elapsed: { type: 'number' },
                lastPaused: { type: 'number' }
              }
            },
            cmdData: { type: 'string' },
            errorInfo: { type: 'array', items: { type: 'string' } },
            outputFiles: { type: 'array', items: { type: 'string' } }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            time: { type: 'number' },
            taskId: { type: 'number' },
            content: { type: 'string' },
            level: { type: 'integer', enum: [0, 1, 2, 3], description: '0=info, 1=ok, 2=warning, 3=error' }
          }
        },
        FFmpegInfo: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            scanning: { type: 'boolean' },
            videoEncodersCount: { type: 'integer' },
            audioEncodersCount: { type: 'integer' },
            muxersCount: { type: 'integer' },
            demuxersCount: { type: 'integer' },
            filtersCount: { type: 'integer' }
          }
        },
        FFmpegProgress: {
          type: 'object',
          properties: {
            frame: { type: 'integer' },
            fps: { type: 'number' },
            q: { type: 'number' },
            size: { type: 'number', description: 'kB' },
            time: { type: 'number', description: '秒' },
            bitrate: { type: 'number', description: 'kbps' },
            speed: { type: 'number' }
          }
        },

        // ==================== 输出参数相关 ====================
        OutputParams: {
          type: 'object',
          properties: {
            input: { $ref: '#/components/schemas/OutputParams_input' },
            filter: { $ref: '#/components/schemas/OutputParams_filter' },
            outputs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  video: { $ref: '#/components/schemas/OutputParams_video' },
                  audio: { $ref: '#/components/schemas/OutputParams_audio' },
                  mux: { $ref: '#/components/schemas/OutputParams_mux' }
                }
              }
            },
            extra: { $ref: '#/components/schemas/OutputParams_extra' }
          }
        },
        OutputParams_input: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { $ref: '#/components/schemas/InputFile' } }
          }
        },
        OutputParams_filter: {
          type: 'object',
          properties: {
            nodes: { type: 'array', items: { $ref: '#/components/schemas/FilterNode' } },
            lines: { type: 'array', items: { $ref: '#/components/schemas/FilterLine' } }
          }
        },
        OutputParams_video: {
          type: 'object',
          properties: {
            vcodec: { type: 'string' },
            resolution: { type: 'string' },
            framerate: { type: 'string' },
            ratecontrol: { type: 'string' },
            ratevalue: { type: 'string' },
            detail: { type: 'object' },
            custom: { type: 'string' }
          }
        },
        OutputParams_audio: {
          type: 'object',
          properties: {
            acodec: { type: 'string' },
            ratecontrol: { type: 'string' },
            ratevalue: { type: 'string' },
            vol: { type: 'number' },
            detail: { type: 'object' },
            custom: { type: 'string' }
          }
        },
        OutputParams_mux: {
          type: 'object',
          properties: {
            format: { type: 'string' },
            moveflags: { type: 'boolean' },
            filePath: { type: 'string' },
            begin: { type: 'string' },
            end: { type: 'string' },
            detail: { type: 'object' },
            keepMetadata: { type: 'string', enum: ['false', 'map', 'movflags', 'both'] },
            keepFileTime: { type: 'string', enum: ['false', 'original', 'autoShift', 'fixCTbyMTandShift', 'fixByFilenameAndShift'] },
            custom: { type: 'string' }
          }
        },
        OutputParams_extra: {
          type: 'object',
          properties: {
            presetName: { type: 'string' }
          }
        },
        InputFile: {
          type: 'object',
          properties: {
            hwaccel: { type: 'string' },
            filePath: { type: 'string' },
            demuxer: { type: 'string' },
            begin: { type: 'string' },
            end: { type: 'string' },
            realtime: { type: 'boolean' },
            detail: { type: 'object' },
            custom: { type: 'string' }
          }
        },
        FilterNode: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            params: { type: 'object' },
            x: { type: 'number' },
            y: { type: 'number' }
          }
        },
        FilterLine: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            prevNodeId: { type: 'integer' },
            prevNodePortIndex: { type: 'integer' },
            nextNodeId: { type: 'integer' },
            nextNodePortIndex: { type: 'integer' },
            type: { type: 'string', enum: ['V', 'A', 'N', 'U'] }
          }
        },

        // ==================== 输入信息相关 ====================
        InputInfo: {
          type: 'object',
          properties: {
            demuxer: { type: 'string' },
            path: { type: 'string' },
            duration: { type: 'number' },
            bitrate: { type: 'number' },
            start: { type: 'number' },
            metadata: { type: 'object' },
            streams: { type: 'array', items: { $ref: '#/components/schemas/StreamInfo' } },
            chapters: { type: 'array', items: { $ref: '#/components/schemas/ChapterInfo' } },
            accessTime: { type: 'number' },
            createTime: { type: 'number' },
            modifyTime: { type: 'number' }
          }
        },
        StreamInfo: {
          type: 'object',
          properties: {
            infoText: { type: 'string' },
            type: { type: 'string' },
            metadata: { type: 'object' },
            sidedata: { type: 'array', items: { type: 'string' } },
            isDefault: { type: 'boolean' },
            language: { type: 'string' },
            codec: { type: 'string' },
            pixelFormat: { type: 'string' },
            resolution: { type: 'string' },
            bitrate: { type: 'number' },
            fps: { type: 'number' },
            sampleRate: { type: 'number' },
            channel: { type: 'string' }
          }
        },
        ChapterInfo: {
          type: 'object',
          properties: {
            infoText: { type: 'string' },
            start: { type: 'number' },
            end: { type: 'number' },
            metadata: { type: 'object' }
          }
        },

        // ==================== FFmpeg 编解码器相关 ====================
        FFmpegCodecDetail: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            encoders: {
              type: 'array',
              items: { $ref: '#/components/schemas/EncoderWithDetail' }
            }
          }
        },
        FFmpegMuxerDetail: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            extensions: { type: 'array', items: { type: 'string' } },
            defaultVideoCodec: { type: 'string' },
            defaultAudioCodec: { type: 'string' },
            options: { type: 'array', items: { $ref: '#/components/schemas/EncoderOption' } }
          }
        },
        FFmpegFilterDetail: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            inputType: { type: 'string' },
            outputType: { type: 'string' },
            options: { type: 'array', items: { $ref: '#/components/schemas/EncoderOption' } }
          }
        },
        EncoderWithDetail: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            generalCapabilities: { type: 'array', items: { type: 'string' } },
            threadingCapabilities: { type: 'string' },
            supportedPixelFormats: { type: 'array', items: { type: 'string' } },
            supportedSampleRates: { type: 'array', items: { type: 'integer' } },
            supportedSampleFormats: { type: 'array', items: { type: 'string' } },
            supportedChannelLayouts: { type: 'array', items: { type: 'string' } },
            options: { type: 'array', items: { $ref: '#/components/schemas/EncoderOption' } }
          }
        },
        EncoderOption: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['int', 'int64', 'float', 'double', 'boolean', 'string', 'dictionary', 'flags', 'color', 'duration', 'image_size', 'rational', 'sample_fmt[]', 'int[]', 'channel_layout[]'] },
            description: { type: 'string' },
            min: { type: 'number' },
            max: { type: 'number' },
            default: { type: 'string' }
          }
        },

        // ==================== 通用响应 ====================
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        CacheInfo: {
          type: 'object',
          properties: {
            uploadCount: { type: 'integer', description: '上传缓存文件数量' },
            uploadSize: { type: 'integer', description: '上传缓存文件总大小（字节）' },
            downloadCount: { type: 'integer', description: '下载缓存文件数量' },
            downloadSize: { type: 'integer', description: '下载缓存文件总大小（字节）' }
          }
        }
      }
    }
  },
  apis: [
    path.resolve(__dirname, '../src/backend/uiBridge.ts')
  ]
};

const specs = swaggerJsdoc(options);

// 输出到文件
const outputPath = path.resolve(__dirname, '../docs/swagger.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2), 'utf-8');

console.log('Swagger 文档已生成至:', outputPath);
console.log('API 数量:', Object.keys(specs.paths || {}).length);

// 生成 Swagger UI 网页
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FFBox API 文档</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body {
      margin: 0;
    }
  </style>
</head>

<body>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: './swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        validatorUrl: null,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: 'list',
        onComplete: function() {
          console.log('Swagger UI loaded successfully');
        }
      });
      
      window.ui = ui;
    };
  </script>
</body>
</html>`;

const htmlPath = path.resolve(__dirname, '../docs/swagger.html');
fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

console.log('Swagger UI 网页已生成至:', htmlPath);
console.log('使用方法：在浏览器中打开 swagger.html 文件即可查看 API 文档');
