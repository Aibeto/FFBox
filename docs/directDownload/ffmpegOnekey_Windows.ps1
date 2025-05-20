$downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$downloadPath = "$env:TEMP\ffmpeg-release-essentials.zip"
$extractPath = "$env:TEMP\ffmpeg_extract"
$installPath = ${env:ProgramFiles} + "\ffmpeg"

Write-Host 👋 本脚本将会为您进行以下操作：
Write-Host 1. 从 https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip 下载 ffmpeg
Write-Host 2. 解压到临时文件夹后释放到 $installPath
Write-Host 3. 在系统环境变量中新增该路径
Write-Host ⏱️ 如无异议，3 秒后将开始进行上述操作～
Start-Sleep 3

# 1. 检查是否以管理员身份运行
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object System.Security.Principal.WindowsPrincipal($CurrentUser)
if (-not $Principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
	Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
	Write-Host " 🤷 需要管理员权限，正在重新启动..."
	Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
	exit
}

# 2. 下载 ffmpeg 压缩包
Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
Write-Host " 🚀 开始下载（若长时间未出现进度则代表网络不通）"
Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath

# 3. 解压
Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
Write-Host " ⌛ 开始解压"
if (!(Test-Path $extractPath)) {
	New-Item -ItemType Directory -Path $extractPath | Out-Null
}
& Expand-Archive -Path $downloadPath -DestinationPath $extractPath

# 4. 查找 ffmpeg-*/bin 目录
$binPath = Get-ChildItem -Path $extractPath -Directory |
	Where-Object { $_.Name -like "ffmpeg-*" } |
	ForEach-Object { Join-Path $_.FullName "bin" } |
	Where-Object { Test-Path $_ } |
	Select-Object -First 1

if (-not $binPath) {
	Write-Error " ❌ ffmpeg 压缩包不符合预期，安装中止"
	Read-Host
	exit 1
}

# 5. 创建目标目录并复制 bin 内容
Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
Write-Host " 📂 开始复制文件到" $installPath
if (Test-Path $installPath) {
	Remove-Item -Recurse -Force $installPath
}
New-Item -ItemType Directory -Path $installPath | Out-Null
Copy-Item -Path $binPath\* -Destination $installPath -Recurse

# 6. 添加环境变量（系统 PATH）
Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
$envPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::Machine)
if (-not ($envPath.Split(';') -contains $installPath)) {
	Write-Host " ✍️ 准备修改环境变量"
	# $newPath = ($envPath -split ';' + $installPath) -join ';'
	$newPath = $envPath + ';' + $installPath
	[Environment]::SetEnvironmentVariable("Path", $newPath, [EnvironmentVariableTarget]::Machine)
} else {
	Write-Host " 🤷 ffmpeg 路径已存在于环境变量中"
}

# 7. 清理临时文件
Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Blue -NoNewline
Write-Host " 🗑️ 清理临时文件"
Remove-Item $downloadPath -Force
Remove-Item $extractPath -Recurse -Force

Write-Host (Get-Date -Format " HH:mm:ss ") -BackgroundColor Green -NoNewline
Write-Host " ✅ ffmpeg 安装完成"
Read-Host
