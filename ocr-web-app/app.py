from flask import Flask, render_template, request
import base64
import requests
import json

app = Flask(__name__)

# 百度 OCR API 配置
API_KEY = 'your_api_key'
SECRET_KEY = 'your_secret_key'

def get_access_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={API_KEY}&client_secret={SECRET_KEY}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def ocr_image(image_base64):
    access_token = get_access_token()
    if access_token:
        url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token={access_token}"
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        data = {'image': image_base64}
        response = requests.post(url, headers=headers, data=data)
        if response.status_code == 200:
            result = response.json()
            words = [item['words'] for item in result.get('words_result', [])]
            return '\n'.join(words)
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['image']
    if file:
        image_base64 = base64.b64encode(file.read()).decode('utf-8')
        text = ocr_image(image_base64)
        if text:
            return text
    return "OCR 识别失败"

if __name__ == '__main__':
    app.run(debug=True)    