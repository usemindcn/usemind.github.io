// DOM Elements
const photoUpload = document.getElementById('photo-upload');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const processButton = document.getElementById('process-button');
const loadingIndicator = document.getElementById('loading');
const resultContainer = document.getElementById('result-container');
const textResult = document.getElementById('text-result');
const readAloudBtn = document.getElementById('read-aloud');
const tryAgainBtn = document.getElementById('try-again');
const errorMessage = document.getElementById('error-message');

// 语音合成变量
let speech;

// 百度云OCR API配置
const API_KEY = "UTY65dENbtF9jInO4eqkubSN";
const SECRET_KEY = "ERguSWhfLQoQEVm1Tpqx4JxlwYwBRqMo";

// 设置暗黑模式
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (event.matches) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
});

// 添加图片上传事件监听器
photoUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 检查文件类型
    if (!file.type.match('image.*')) {
        showMessage('请选择图片文件（JPG、PNG等）', 'error');
        return;
    }
    
    // 读取并预览图片
    const reader = new FileReader();
    reader.onload = function(e) {
        imagePreview.src = e.target.result;
        previewContainer.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    };
    reader.onerror = function() {
        showMessage('读取图片失败，请重试', 'error');
    };
    reader.readAsDataURL(file);
});

// 获取百度云OCR的access_token - 使用JSONP方式避免CORS问题
async function getBaiduAccessToken() {
    return new Promise((resolve, reject) => {
        try {
            // 创建一个全局回调函数
            const callbackName = 'baiduTokenCallback_' + Math.floor(Math.random() * 100000);
            window[callbackName] = function(response) {
                if (response && response.access_token) {
                    console.log('获取token成功:', response);
                    resolve(response.access_token);
                } else {
                    console.error('获取token失败，返回数据无效:', response);
                    reject(new Error('获取授权失败，返回数据无效'));
                }
                // 清理回调函数和script标签
                delete window[callbackName];
                document.body.removeChild(script);
            };
            
            // 创建script标签用于JSONP请求
            const script = document.createElement('script');
            script.src = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}&callback=${callbackName}`;
            script.onerror = function() {
                console.error('获取token请求失败');
                reject(new Error('获取授权失败，请检查网络连接'));
                delete window[callbackName];
                document.body.removeChild(script);
            };
            
            // 添加到页面发起请求
            document.body.appendChild(script);
            
            // 设置超时处理
            setTimeout(() => {
                if (window[callbackName]) {
                    console.error('获取token请求超时');
                    reject(new Error('获取授权超时，请稍后再试'));
                    delete window[callbackName];
                    document.body.removeChild(script);
                }
            }, 10000); // 10秒超时
            
        } catch (error) {
            console.error('获取百度云access_token失败:', error);
            reject(new Error('获取授权失败，请稍后再试'));
        }
    });
}

// 使用百度云OCR API识别图片中的文字
async function recognizeTextFromImage(imageData) {
    try {
        // 获取access_token
        const accessToken = await getBaiduAccessToken();
        
        // 准备图片数据 - 确保正确处理base64编码
        let base64Image = imageData;
        if (base64Image.includes(',')) {
            base64Image = base64Image.split(',')[1];
        }
        
        console.log('准备发送OCR请求...');
        
        // 使用正确的API地址和参数格式
        const response = await axios({
            method: 'post',
            url: `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data: `image=${encodeURIComponent(base64Image)}`
        });
        
        // 添加更详细的日志
        console.log('百度OCR响应状态:', response.status);
        
        // 提取识别的文字
        if (response.data && response.data.words_result && response.data.words_result.length > 0) {
            console.log('识别成功，文字数量:', response.data.words_result.length);
            return response.data.words_result.map(item => item.words).join('\n');
        } else {
            console.error('OCR返回结果无文字:', response.data);
            throw new Error('未能识别出文字，请尝试更清晰的图片');
        }
    } catch (error) {
        console.error('OCR识别失败详情:', error);
        
        // 更详细的错误处理
        if (error.response) {
            console.error('错误响应数据:', error.response.data);
            console.error('错误状态码:', error.response.status);
        }
        
        throw new Error('文字识别失败，请确保图片清晰且包含文字');
    }
}

// 添加图片处理函数，确保图片符合百度OCR要求
async function processImage(imageData) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            try {
                // 百度OCR对图片大小有限制，最大不超过4MB
                const maxSize = 3 * 1024 * 1024; // 设置为3MB以确保安全
                let needsCompression = false;
                
                // 估算base64大小
                const base64Size = imageData.length * 0.75; // base64字符串长度约为实际大小的4/3
                console.log('估计图片大小:', Math.round(base64Size/1024), 'KB');
                
                if (base64Size > maxSize) {
                    needsCompression = true;
                    console.log('图片过大，需要压缩');
                }
                
                // 检查图片尺寸
                const maxDimension = 4096; // 百度OCR支持的最大尺寸
                if (img.width > maxDimension || img.height > maxDimension) {
                    needsCompression = true;
                    console.log('图片尺寸过大，需要调整');
                }
                
                if (needsCompression) {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 计算压缩比例
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height && width > maxDimension) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    } else if (height > maxDimension) {
                        width = Math.round(width * (maxDimension / height));
                        height = maxDimension;
                    }
                    
                    // 确保尺寸合理
                    width = Math.min(width, 2048);
                    height = Math.min(height, 2048);
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 获取压缩后的图片，调整质量以确保大小合适
                    let quality = 0.8;
                    let result = canvas.toDataURL('image/jpeg', quality);
                    
                    // 如果还是太大，继续压缩
                    while (result.length > maxSize && quality > 0.3) {
                        quality -= 0.1;
                        result = canvas.toDataURL('image/jpeg', quality);
                        console.log(`压缩质量: ${quality.toFixed(1)}, 大小: ${Math.round(result.length/1024)}KB`);
                    }
                    
                    console.log(`图片已压缩，最终质量: ${quality.toFixed(1)}`);
                    resolve(result);
                } else {
                    resolve(imageData);
                }
            } catch (err) {
                console.error('图片处理错误:', err);
                reject(new Error('图片处理失败，请尝试其他图片'));
            }
        };
        img.onerror = function() {
            reject(new Error('图片加载失败，请确保图片格式正确'));
        };
        img.src = imageData;
    });
}

// 处理识别按钮点击事件
processButton.addEventListener('click', async () => {
    if (!imagePreview.src) {
        showMessage('请先选择一张图片', 'error');
        return;
    }

    // 显示加载动画
    loadingIndicator.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    errorMessage.classList.add('hidden');

    try {
        console.log('开始处理图片...');
        // 处理图片（压缩如果需要）
        const processedImage = await processImage(imagePreview.src);
        console.log('图片处理完成，准备识别...');
        
        // 调用百度OCR API识别图片文字
        const recognizedText = await recognizeTextFromImage(processedImage);
        
        if (!recognizedText || recognizedText.trim() === '') {
            throw new Error('未能识别出任何文字，请尝试更清晰的图片');
        }
        
        console.log('识别成功，处理文字和拼音...');
        processRecognizedText(recognizedText);
    } catch (error) {
        console.error('处理过程出错:', error);
        loadingIndicator.classList.add('hidden');
        showMessage(`识别错误: ${error.message}`, 'error');
    }
});

// 处理识别出的文字并添加拼音
function processRecognizedText(text) {
    loadingIndicator.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    
    // 清除之前的结果
    textResult.innerHTML = '';
    
    // 为结果容器添加彩色边框效果
    textResult.classList.add('rainbow-border', 'p-4', 'rounded-lg');
    
    // 为每个字符添加拼音
    for (let char of text) {
        if (/\s/.test(char)) {
            // 对于空格，直接添加空格
            textResult.innerHTML += ' ';
            continue;
        }
        
        if (/[\u4e00-\u9fa5]/.test(char)) {
            // 如果是汉字
            try {
                // 使用pinyin-pro获取拼音
                const pinyin = pinyinPro.pinyin(char, { toneType: 'symbol', type: 'array' })[0];
                
                // 创建字符容器
                const container = document.createElement('div');
                container.className = 'character-container';
                
                // 添加拼音
                const pinyinSpan = document.createElement('span');
                pinyinSpan.className = 'pinyin';
                pinyinSpan.textContent = pinyin;
                container.appendChild(pinyinSpan);
                
                // 添加汉字
                const charSpan = document.createElement('span');
                charSpan.className = 'chinese-char';
                charSpan.textContent = char;
                container.appendChild(charSpan);
                
                // 添加悬停动画效果
                container.addEventListener('mouseenter', function() {
                    this.classList.add('float-animation');
                });
                container.addEventListener('mouseleave', function() {
                    this.classList.remove('float-animation');
                });
                
                textResult.appendChild(container);
            } catch (e) {
                // 如果拼音转换失败，直接添加字符
                textResult.innerHTML += char;
            }
        } else {
            // 如果不是汉字，直接添加
            textResult.innerHTML += char;
        }
    }
}

// 朗读文字功能
readAloudBtn.addEventListener('click', () => {
    // 停止正在进行的朗读
    if (speech && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        return;
    }

    // 获取所有汉字
    const characters = [];
    const charElements = document.querySelectorAll('.chinese-char');
    charElements.forEach(el => {
        characters.push(el.textContent);
    });

    const textToRead = characters.join('');
    if (!textToRead) return;

    // 创建语音合成实例
    speech = new SpeechSynthesisUtterance(textToRead);
    speech.lang = 'zh-CN';  // 设置语言为中文
    speech.rate = 0.8;      // 稍慢一点，适合儿童

    // 朗读文字
    speechSynthesis.speak(speech);
    
    // 添加朗读状态指示
    readAloudBtn.classList.add('bg-red-500');
    readAloudBtn.querySelector('svg').classList.add('animate-pulse');
    
    // 朗读结束后恢复按钮状态
    speech.onend = function() {
        readAloudBtn.classList.remove('bg-red-500');
        readAloudBtn.querySelector('svg').classList.remove('animate-pulse');
    };
});

// 再试一次按钮
tryAgainBtn.addEventListener('click', () => {
    // 重置所有状态
    photoUpload.value = null;
    imagePreview.src = '';
    previewContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    // 停止正在进行的朗读
    if (speech && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
});

// 显示消息（错误或成功）
function showMessage(message, type = 'error') {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    
    if (type === 'error') {
        errorMessage.classList.remove('bg-green-100', 'text-green-700', 'dark:bg-green-900/30', 'dark:text-green-300');
        errorMessage.classList.add('bg-red-100', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-300');
    } else {
        errorMessage.classList.remove('bg-red-100', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-300');
        errorMessage.classList.add('bg-green-100', 'text-green-700', 'dark:bg-green-900/30', 'dark:text-green-300');
    }
    
    // 3秒后自动隐藏
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 3000);
}

// 为汉字添加点击朗读功能
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('chinese-char')) {
        // 如果点击的是汉字
        const char = e.target.textContent;
        
        // 创建语音合成实例
        const charSpeech = new SpeechSynthesisUtterance(char);
        charSpeech.lang = 'zh-CN';
        
        // 朗读单个汉字
        speechSynthesis.speak(charSpeech);
        
        // 添加视觉反馈
        e.target.classList.add('text-primary');
        setTimeout(() => {
            e.target.classList.remove('text-primary');
        }, 500);
    }
});
