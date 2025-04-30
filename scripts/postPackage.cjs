const path = require('path');
const ChildProcess = require('child_process');
const spawn = ChildProcess.spawn;
const fsProm = require('fs').promises;

// 颜色信息可参考 https://misc.flogisoft.com/bash/tip_colors_and_formatting
function wrapColor(color, msg) {
	const colorString = [49, 41, 42, 43, 46, 104][['default', 'red', 'green', 'yellow', 'cyan', 'light blue'].indexOf(color) || 0];
    return `\x1b[${colorString};97m ${msg} \x1b[49;39m`;
}

module.exports = function () {
	console.log(wrapColor('light blue', '复制前端编译结果到 app/backend/webUI'));
    fsProm.rm(path.resolve('app/backend/webUI'), { recursive: true, force: true })
        .then(() => fsProm.mkdir(path.resolve('app/backend/webUI')))
        .then(() => fsProm.cp(path.resolve('app/renderer'), path.resolve('app/backend/webUI'), { recursive: true }))
        .catch((err) => console.error(wrapColor('red', '复制前端编译结果失败：'), err));

    console.log(wrapColor('light blue', '执行 ISCC 打包'));
    if (process.platform === 'win32') {
        const issPath = path.resolve('WindowsInstaller/FFBox.iss');
        spawn('iscc', [issPath], { stdio: 'inherit' });
    }
}
