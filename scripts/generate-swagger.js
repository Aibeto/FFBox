const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

// 读取自动生成的 schemas
const generatedSchemasPath = path.resolve(__dirname, '../docs/schemas.json');
let generatedSchemas = {};
if (fs.existsSync(generatedSchemasPath)) {
	generatedSchemas = JSON.parse(fs.readFileSync(generatedSchemasPath, 'utf-8'));
	console.log('已加载自动生成的 schemas:', Object.keys(generatedSchemas).length, '个');
} else {
	console.warn('警告: 未找到自动生成的 schemas 文件，请先运行 node scripts/generate-schemas.js');
}

// 手动补充的 schemas（不在 types.ts 中定义的类型）
const manualSchemas = {
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
};

const options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'FFBox API',
			version: '5.4.0',
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
			// 合并自动生成的 schemas 和手动补充的 schemas
			schemas: {
				...generatedSchemas,
				...manualSchemas
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
