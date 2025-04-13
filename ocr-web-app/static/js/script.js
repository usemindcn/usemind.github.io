const uploadForm = document.getElementById('uploadForm');
const resultDiv = document.getElementById('result');

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const text = await response.text();
        resultDiv.textContent = text;
    } catch (error) {
        resultDiv.textContent = '请求出错: ' + error.message;
    }
});    