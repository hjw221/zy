from flask import Flask, render_template, request, jsonify, make_response
import os
from docx import Document
import random
import re
import sqlite3
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DATABASE'] = 'database.db'
app.config['DOCS_PATH'] = r'/sd/2/中药学习题'  # 用于全局路径配置

# 初始化数据库
def init_db():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                is_multiple_choice BOOLEAN DEFAULT 0
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS user_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id INTEGER,
                user_answer TEXT,
                is_correct BOOLEAN,
                FOREIGN KEY (question_id) REFERENCES questions (id)
            )
        ''')
        db.commit()

def get_db():
    db = sqlite3.connect(app.config['DATABASE'])
    db.row_factory = sqlite3.Row
    return db

def clean_text(text):
    lines = [line.strip() for line in text.splitlines()]
    return '\n'.join([line for line in lines if line])

# 支持按内容自动分章节
# 章节标题正则：如“第一章”“第二章”“第三章 药物”
chapter_pattern = re.compile(r'第[一二三四五六七八九十百零〇\d]+章[\s\S]*')

# 从Word文档解析题目的函数 (保留原有逻辑)
def parse_docx_file(file_path):
    """解析docx文件，支持题干-多行选项-答案结构"""
    questions = []
    try:
        doc = Document(file_path)
        all_paragraphs = [para.text.strip() for para in doc.paragraphs if para.text.strip()]
        i = 0
        current_chapter = extract_chapter_name(os.path.basename(file_path))
        while i < len(all_paragraphs):
            text = all_paragraphs[i]
            # 检查章节标题
            if chapter_pattern.match(text):
                current_chapter = text.strip()
                i += 1
                continue
            # 题组（A-E开头，后跟多题干）
            if re.match(r'^[A-E][\.、．]', text):
                options_block = [text]
                j = i + 1
                while j < len(all_paragraphs) and re.match(r'^[A-E][\.、．]', all_paragraphs[j]):
                    options_block.append(all_paragraphs[j])
                    j += 1
                question_blocks = []
                k = j
                while k < len(all_paragraphs) and not (re.match(r'^(答案|答)[:：]', all_paragraphs[k]) or re.match(r'^[A-E][\.、．]', all_paragraphs[k])):
                    if re.match(r'^\d+[\.．、:：]?', all_paragraphs[k]):
                        question_blocks.append(all_paragraphs[k])
                    k += 1
                answer_line = ''
                answer_analysis = ''
                if k < len(all_paragraphs) and re.match(r'^(答案|答)[:：]', all_paragraphs[k]):
                    answer_line = all_paragraphs[k]
                    k += 1
                if k < len(all_paragraphs) and (all_paragraphs[k].startswith('答案分析：') or '答案分析：' in all_paragraphs[k]):
                    answer_analysis = all_paragraphs[k]
                    k += 1
                group_question = '\n'.join(options_block + question_blocks)
                group_answer = answer_line
                # 题组型也去重“答案分析”
                if answer_analysis:
                    answer_analysis_clean = re.sub(r'^答案分析[:：]\s*', '', answer_analysis)
                    group_answer = re.sub(r'(\n)?答案分析[:：].*', '', group_answer)
                    group_answer = group_answer.strip()
                    group_answer += '\n答案分析：' + answer_analysis_clean
                if group_question and group_answer:
                    questions.append((current_chapter, clean_text(group_question), clean_text(group_answer)))
                i = k
                continue
            # 单题型：题干-多行选项-答案-答案分析
            if re.match(r'^\d+[\.．、:：]?', text):
                current_question = text
                j = i + 1
                # 收集多行选项
                options_lines = []
                while j < len(all_paragraphs) and re.match(r'^[A-E][\.、．]', all_paragraphs[j]):
                    options_lines.append(all_paragraphs[j])
                    j += 1
                if options_lines:
                    current_question += '\n' + '\n'.join(options_lines)
                # 查找答案
                current_answer = ''
                if j < len(all_paragraphs) and re.match(r'^(答案|答)[:：]', all_paragraphs[j]):
                    current_answer = all_paragraphs[j]
                    j += 1
                # 答案分析（无论是否独立一行或紧跟在答案后面都识别）
                answer_analysis = ''
                if j < len(all_paragraphs):
                    if all_paragraphs[j].startswith('答案分析：') or all_paragraphs[j].startswith('答案分析:'):
                        answer_analysis = all_paragraphs[j]
                        j += 1
                    elif '答案分析：' in current_answer or '答案分析:' in current_answer:
                        pass
                    elif re.match(r'^(答案|答)[:：].*答案分析[：:]', current_answer):
                        pass
                # 只保留一次“答案分析”，并去掉多余前缀
                if answer_analysis:
                    # 去掉所有“答案分析：”或“答案分析:”前缀
                    answer_analysis_clean = re.sub(r'^答案分析[:：]\s*', '', answer_analysis)
                    # 检查current_answer里是否已包含“答案分析”，如有则去掉
                    current_answer = re.sub(r'(\n)?答案分析[:：].*', '', current_answer)
                    current_answer = current_answer.strip()
                    current_answer += '\n答案分析：' + answer_analysis_clean
                questions.append((current_chapter, clean_text(current_question), clean_text(current_answer)))
                i = j
                continue
            i += 1
        return questions
    except Exception as e:
        print(f"Error parsing file {file_path}: {str(e)}")
        raise

# API路由
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/questions', methods=['GET'])
def get_questions():
    # 获取所有题目
    db = get_db()
    questions = db.execute('SELECT * FROM questions').fetchall()
    return jsonify([dict(q) for q in questions])

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.docx'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # 解析题目
        questions = parse_docx_file(filepath)
        
        # 保存到数据库前清空题库
        db = get_db()
        db.execute('DELETE FROM questions')
        db.commit()
        for q in questions:
            # q = (chapter, question, answer)
            is_mc = bool(re.search(r'[A-E][\.、．]', q[1]))
            db.execute(
                'INSERT INTO questions (chapter, question, answer, is_multiple_choice) VALUES (?, ?, ?, ?)',
                (q[0], q[1], q[2], is_mc)
            )
        db.commit()
        
        return jsonify({'message': f'Successfully uploaded and parsed {len(questions)} questions', 'count': len(questions)})
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/load_from_path', methods=['POST'])
def load_from_path():
    docs_path = app.config['DOCS_PATH']
    if not os.path.exists(docs_path):
        return jsonify({'error': f'路径不存在: {docs_path}'}), 400
    files = [f for f in os.listdir(docs_path) if f.endswith('.docx')]
    if not files:
        return jsonify({'error': '未找到docx文件'}), 400
    db = get_db()
    # 清空题库表，防止重复导入
    db.execute('DELETE FROM questions')
    db.commit()
    total = 0
    for filename in files:
        filepath = os.path.join(docs_path, filename)
        try:
            questions = parse_docx_file(filepath)
            for q in questions:
                is_mc = bool(re.search(r'[A-E][\.、．]', q[1]))
                db.execute(
                    'INSERT INTO questions (chapter, question, answer, is_multiple_choice) VALUES (?, ?, ?, ?)',
                    (q[0], q[1], q[2], is_mc)
                )
                total += 1
        except Exception as e:
            continue
    db.commit()
    return jsonify({'message': f'成功导入 {total} 道题目', 'path': docs_path, 'count': total})

def extract_chapter_name(filename):
    """从文件名提取章节名"""
    name = os.path.splitext(filename)[0]
    name = re.sub(r'习题答案$|答案$|习题$', '', name)
    name = re.sub(r'^[\d\s\-]+', '', name)
    return name.strip()

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    response = {
        'error': str(e),
        'trace': traceback.format_exc()
    }
    return make_response(jsonify(response), 500)

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    init_db()
    app.run(debug=True)