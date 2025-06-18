document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    let questions = [];
    let currentQuestionIndex = 0;
    let answeredQuestions = new Set();
    let randomMode = false;
    let chapters = [];
    
    // DOM元素
    const questionTextEl = document.getElementById('question-text');
    const answerTextEl = document.getElementById('answer-text');
    const answerInputEl = document.getElementById('answer-input');
    const optionsContainerEl = document.getElementById('options-container');
    const optionBtns = document.querySelectorAll('.option-btn');
    const chapterSelectEl = document.getElementById('chapter-select');
    const progressLabelEl = document.getElementById('progress-label');
    const randomModeEl = document.getElementById('random-mode');
    const prevBtnEl = document.getElementById('prev-btn');
    const nextBtnEl = document.getElementById('next-btn');
    const showAnswerBtnEl = document.getElementById('show-answer-btn');
    const resetBtnEl = document.getElementById('reset-btn');
    const uploadBtnEl = document.getElementById('upload-btn');
    const fileInputEl = document.getElementById('file-input');
    const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
    
    // 初始化应用
    init();
    
    // 事件监听器
    randomModeEl.addEventListener('change', toggleRandomMode);
    prevBtnEl.addEventListener('click', showPreviousQuestion);
    nextBtnEl.addEventListener('click', showNextQuestion);
    showAnswerBtnEl.addEventListener('click', showAnswer);
    resetBtnEl.addEventListener('click', resetAnsweredQuestions);
    uploadBtnEl.addEventListener('click', uploadFile);
    optionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            selectOption(this.dataset.option);
        });
    });
    
    // 初始化函数
    function init() {
        fetchQuestions();
        
        // 添加上传按钮到导航栏
        const nav = document.createElement('nav');
        nav.className = 'navbar navbar-light bg-light mb-4';
        nav.innerHTML = `
            <div class="container-fluid">
                <span class="navbar-brand">中药学习题练习</span>
                <button class="btn btn-outline-success" id="open-upload-modal">上传题目文件</button>
            </div>
        `;
        document.body.prepend(nav);
        document.getElementById('open-upload-modal').addEventListener('click', () => {
            uploadModal.show();
        });
    }
    
    // 从后端获取题目
    function fetchQuestions() {
        fetch('/api/questions')
            .then(response => response.json())
            .then(data => {
                questions = data;
                if (questions.length > 0) {
                    initChapters();
                    updateQuestionDisplay();
                    updateProgress();
                } else {
                    questionTextEl.textContent = '没有找到题目，请上传题目文件。';
                    uploadModal.show();
                }
            })
            .catch(error => {
                console.error('Error fetching questions:', error);
                questionTextEl.textContent = '加载题目失败，请刷新页面重试。';
            });
    }
    
    // 初始化章节选择
    function initChapters() {
        chapters = [...new Set(questions.map(q => q.chapter))];
        chapterSelectEl.innerHTML = '<option value="all">所有章节</option>';
        chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = chapter;
            option.textContent = chapter;
            chapterSelectEl.appendChild(option);
        });
        
        chapterSelectEl.addEventListener('change', filterQuestionsByChapter);
    }
    
    // 按章节筛选题目
    function filterQuestionsByChapter() {
        const selectedChapter = chapterSelectEl.value;
        if (selectedChapter === 'all') {
            fetchQuestions();
        } else {
            fetch('/api/questions')
                .then(response => response.json())
                .then(data => {
                    questions = data.filter(q => q.chapter === selectedChapter);
                    currentQuestionIndex = 0;
                    updateQuestionDisplay();
                    updateProgress();
                });
        }
    }
    
    // 更新题目显示
    function updateQuestionDisplay() {
        if (questions.length === 0) {
            questionTextEl.textContent = '没有找到题目，请上传题目文件。';
            answerInputEl.value = '';
            answerTextEl.innerHTML = '';
            optionsContainerEl.classList.add('d-none');
            return;
        }
        
        const question = questions[currentQuestionIndex];
        questionTextEl.innerHTML = formatQuestionText(question.question);
        answerInputEl.value = '';
        answerTextEl.innerHTML = '';
        
        // 显示或隐藏选择题选项
        if (question.is_multiple_choice) {
            optionsContainerEl.classList.remove('d-none');
            optionBtns.forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-outline-primary');
            });
        } else {
            optionsContainerEl.classList.add('d-none');
        }
        
        // 如果已经回答过，显示答案
        if (answeredQuestions.has(question.id)) {
            showAnswer();
        }
    }
    
    // 格式化题目文本
    function formatQuestionText(text) {
        // 先将所有连续的\n替换为单个<br>，再处理选项格式
        let html = text.replace(/\n+/g, '<br>');
        // 处理选择题选项格式（如A. B.等）
        html = html.replace(/(<br>)?([A-E][\.、．])([^<]*)/g, '<div class="option-line"><span class="option-label">$2</span>$3</div>');
        return html;
    }
    
    // 显示上一题
    function showPreviousQuestion() {
        if (questions.length === 0) return;
        if (randomMode) {
            // 随机模式：上一题也随机
            currentQuestionIndex = Math.floor(Math.random() * questions.length);
        } else {
            currentQuestionIndex = (currentQuestionIndex - 1 + questions.length) % questions.length;
        }
        updateQuestionDisplay();
        updateProgress();
    }

    // 显示下一题
    function showNextQuestion() {
        if (questions.length === 0) return;
        if (randomMode) {
            // 随机模式：下一题随机且不重复当前题
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * questions.length);
            } while (questions.length > 1 && nextIndex === currentQuestionIndex);
            currentQuestionIndex = nextIndex;
        } else {
            currentQuestionIndex = (currentQuestionIndex + 1) % questions.length;
        }
        updateQuestionDisplay();
        updateProgress();
    }
    
    // 选择选项
    function selectOption(option) {
        const question = questions[currentQuestionIndex];
        if (!question.is_multiple_choice) return;
        answerInputEl.value = option;
        optionBtns.forEach(btn => {
            if (btn.dataset.option === option) {
                btn.classList.remove('btn-outline-primary');
                btn.classList.add('btn-primary');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-outline-primary');
            }
        });
        // 选项点击后自动显示答案
        showAnswer();
    }
    
    // 显示答案
    function showAnswer() {
        if (questions.length === 0) return;
        
        const question = questions[currentQuestionIndex];
        const userAnswer = answerInputEl.value.trim();
        const fullAnswer = question.answer;
        const correctAnswer = extractCorrectAnswer(fullAnswer);
        
        // 分割答案和解析部分
        const answerParts = fullAnswer.split('\n\n答案分析:\n');
        const mainAnswer = answerParts[0];
        const analysis = answerParts.length > 1 ? answerParts[1] : '';
        
        let answerHtml = `
            <div class="mb-2">
                <span class="correct-answer">${mainAnswer}</span>
            </div>
        `;
        
        if (userAnswer) {
            const isCorrect = userAnswer === correctAnswer;
            // 记录已回答题目但不显示
            if (!answeredQuestions.has(question.id)) {
                answeredQuestions.add(question.id);
                updateProgress();
            }
        }
        
        if (analysis) {
            answerHtml += `
                <div class="answer-analysis mt-3 p-2 bg-light rounded">
                    <strong>答案分析:</strong><br>
                    ${analysis.replace(/\n/g, '<br>')}
                </div>
            `;
        }
        
        answerTextEl.innerHTML = answerHtml;
    }
    
    // 从答案文本中提取正确答案
    function extractCorrectAnswer(answerText) {
        const match = answerText.match(/^答案[:：]\s*([A-E])/);
        return match ? match[1] : answerText.split('\n')[0].replace(/^答案[:：]\s*/, '');
    }
    
    // 更新进度显示
    function updateProgress() {
        progressLabelEl.textContent = `已答题目: ${answeredQuestions.size} / 总题目: ${questions.length}`;
    }
    
    // 切换随机模式
    function toggleRandomMode() {
        randomMode = randomModeEl.checked;
        if (randomMode && questions.length > 0) {
            currentQuestionIndex = Math.floor(Math.random() * questions.length);
            updateQuestionDisplay();
        }
    }
    
    // 重置已回答题目
    function resetAnsweredQuestions() {
        answeredQuestions.clear();
        currentQuestionIndex = 0;
        updateProgress();
        updateQuestionDisplay();
    }
    
    // 上传题目文件或文件夹
    function uploadFile() {
        const fileInput = document.getElementById('file-input');
        const folderInput = document.getElementById('folder-input');
        
        if (fileInput.files.length === 0 && folderInput.files.length === 0) {
            alert('请选择文件或文件夹');
            return;
        }
        
        const formData = new FormData();
        
        // 处理单个文件
        if (fileInput.files.length > 0) {
            formData.append('file', fileInput.files[0]);
        }
        
        // 处理文件夹
        if (folderInput.files.length > 0) {
            Array.from(folderInput.files).forEach(file => {
                formData.append('folder', file);
            });
        }
        
        // 显示上传中状态
        const uploadBtn = document.getElementById('upload-btn');
        const originalText = uploadBtn.innerHTML;
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 上传中...';
        
        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert(`成功上传 ${data.count} 道题目`);
                uploadModal.hide();
                fetchQuestions();
            }
        })
        .catch(error => {
            console.error('Error uploading:', error);
            alert('上传失败: ' + error.message);
        })
        .finally(() => {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
            fileInput.value = '';
            folderInput.value = '';
        });
    }

    // 从配置路径加载题目
    function loadFromPath() {
        const btn = document.getElementById('load-path-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 加载中...';
        
        fetch('/api/load_from_path', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert(`从路径 ${data.path} 加载了 ${data.count} 道题目`);
                fetchQuestions();
            }
        })
        .catch(error => {
            console.error('Error loading from path:', error);
            alert('加载失败: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }

    // 绑定按钮点击事件
    document.getElementById('load-path-btn').addEventListener('click', loadFromPath);
});