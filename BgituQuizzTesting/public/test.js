let testData = null;
let timeLeft = 0;
let timerInterval = null;

// Сохраняем время старта теста
if (!localStorage.getItem('testStartTime')) {
    localStorage.setItem('testStartTime', Date.now().toString());
}

document.addEventListener('DOMContentLoaded', async () => {
    const testId = localStorage.getItem('selectedTestId');
    if (!testId) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/tests/${testId}`);
        testData = await response.json();
        
        document.getElementById('testTitle').textContent = testData.title;
        const startTime = parseInt(localStorage.getItem('testStartTime') || Date.now());
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000); // в секундах
        timeLeft = testData.timeLimit * 60 - elapsed;
        if (timeLeft < 0) timeLeft = 0;
        startTimer();
        renderQuestions();
    } catch (error) {
        console.error('Ошибка при загрузке теста:', error);
        alert('Не удалось загрузить тест');
    }

    const submitBtn = document.getElementById('submitTest');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitTest);
    }

    // Восстановление ответов из localStorage
    restoreAnswers();
});

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitTest();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeElem = document.getElementById('timeLeft');
    if (timeElem) {
        timeElem.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function extractMediaFromText(text) {
    // Ищет ссылки на изображения и видео, возвращает {text, images:[], videos:[]}
    const imageRegex = /(https?:\/\/[\w\-./%?=&]+\.(?:jpg|jpeg|png|gif|webp|svg))/gi;
    const videoRegex = /(https?:\/\/[\w\-./%?=&]+\.(?:mp4|webm|ogg))/gi;
    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+))/gi;
    let images = [], videos = [], youtubes = [];
    let cleanText = text;

    cleanText = cleanText.replace(imageRegex, (m) => { images.push(m); return ''; });
    cleanText = cleanText.replace(videoRegex, (m) => { videos.push(m); return ''; });
    cleanText = cleanText.replace(youtubeRegex, (m, url, id) => { youtubes.push(id); return ''; });

    return { text: cleanText.trim(), images, videos, youtubes };
}

function renderLatexInElement(element, text) {
    // Находит $...$ или $$...$$ и рендерит через KaTeX
    if (!window.katex) {
        element.textContent = text;
        return;
    }
    // Рендерим все формулы
    let html = text;
    html = html.replace(/\$\$(.+?)\$\$/gs, (m, code) => {
        try {
            return katex.renderToString(code, { displayMode: true });
        } catch (e) {
            return `<span class='text-danger'>Ошибка формулы</span>`;
        }
    });
    html = html.replace(/\$(.+?)\$/gs, (m, code) => {
        try {
            return katex.renderToString(code, { displayMode: false });
        } catch (e) {
            return `<span class='text-danger'>Ошибка формулы</span>`;
        }
    });
    element.innerHTML = html;
}

function renderQuestions() {
    const container = document.getElementById('questionsContainer');
    testData.questions.forEach((question, index) => {
        console.log('renderQuestions:', question.id, question.type, question);
        const questionCard = document.createElement('div');
        questionCard.className = 'question-card';

        const header = document.createElement('div');
        header.className = 'question-header';
        header.innerHTML = `
            <h4>Вопрос ${index + 1}</h4>
            <span class="badge bg-primary">${question.block}</span>
        `;

        // Парсим медиа
        const media = extractMediaFromText(question.text);
        const text = document.createElement('div');
        text.className = 'question-text';
        renderLatexInElement(text, media.text);

        // Добавляем картинки
        media.images.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'img-fluid my-2 d-block';
            img.alt = 'Изображение к вопросу';
            text.appendChild(img);
        });
        // Добавляем видео
        media.videos.forEach(url => {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.className = 'my-2 d-block';
            text.appendChild(video);
        });
        // Добавляем YouTube
        media.youtubes.forEach(id => {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${id}`;
            iframe.width = 400;
            iframe.height = 225;
            iframe.frameBorder = 0;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.className = 'my-2 d-block';
            text.appendChild(iframe);
        });

        questionCard.appendChild(header);
        questionCard.appendChild(text);

        switch (question.type) {
            case 'open':
                renderOpenQuestion(questionCard, question);
                break;
            case 'multiple_choice':
                renderMultipleChoiceQuestion(questionCard, question);
                break;
            case 'matching':
            case 'pairs':
                renderMatchingQuestion(questionCard, question);
                break;
            case 'image':
                renderImageQuestion(questionCard, question);
                break;
            case 'latex':
                renderLatexQuestion(questionCard, question);
                break;
        }

        container.appendChild(questionCard);
    });
}

function renderOpenQuestion(container, question) {
    const input = document.createElement('textarea');
    input.className = 'form-control';
    input.rows = 3;
    input.dataset.questionId = question.id;
    input.placeholder = 'Введите ваш ответ...';
    container.appendChild(input);

    // Live-превью формулы
    const preview = document.createElement('div');
    preview.className = 'mt-2';
    container.appendChild(preview);

    input.addEventListener('input', () => {
        const value = input.value;
        if (value.includes('$')) {
            try {
                // Рендерим только если есть $...$
                renderLatexInElement(preview, value);
                preview.classList.remove('text-danger');
            } catch (e) {
                preview.textContent = 'Ошибка формулы!';
                preview.classList.add('text-danger');
            }
        } else {
            preview.textContent = '';
        }
    });
}

function renderMultipleChoiceQuestion(container, question) {
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'options-container';

    const isMulti = question.originalType === 'multiclosed';

    question.options.forEach((option, index) => {
        const div = document.createElement('div');
        div.className = 'form-check mb-2';

        const input = document.createElement('input');
        input.type = isMulti ? 'checkbox' : 'radio';
        input.className = 'form-check-input';
        input.name = `question_${question.id}`;
        input.value = index;
        input.dataset.questionId = question.id;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.textContent = option;

        div.appendChild(input);
        div.appendChild(label);
        optionsContainer.appendChild(div);
    });

    container.appendChild(optionsContainer);
}

function renderMatchingQuestion(container, question) {
    const matchingContainer = document.createElement('div');
    matchingContainer.className = 'row';
    matchingContainer.setAttribute('data-question-id-matching', question.id);

    // Копируем определения для drag-n-drop
    let definitions = [...(question.pairs.definitions || [])];

    // Первый столбик — термины (цифры)
    const termsCol = document.createElement('div');
    termsCol.className = 'col-6';
    (question.pairs.terms || []).forEach((term, i) => {
        const div = document.createElement('div');
        div.className = 'matching-term mb-2 p-2 border bg-light';
        div.textContent = term;
        div.dataset.index = i;
        termsCol.appendChild(div);
    });

    // Второй столбик — определения (буквы, drag-n-drop)
    const defsCol = document.createElement('div');
    defsCol.className = 'col-6';

    function renderDefs() {
        defsCol.innerHTML = '';
        definitions.forEach((definition, i) => {
            const div = document.createElement('div');
            div.className = 'matching-def mb-2 p-2 border bg-white';
            div.textContent = definition;
            div.draggable = true;
            div.dataset.index = i;

            div.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', i);
                div.classList.add('dragging');
            };
            div.ondragend = () => {
                div.classList.remove('dragging');
            };
            div.ondragover = (e) => e.preventDefault();
            defsCol.appendChild(div);
        });
    }
    renderDefs();

    // Drag-n-drop логика: меняем местами определения
    defsCol.ondragover = (e) => {
        e.preventDefault();
        const dragging = defsCol.querySelector('.dragging');
        const afterElement = getDragAfterElement(defsCol, e.clientY);
        if (afterElement == null) {
            defsCol.appendChild(dragging);
        } else {
            defsCol.insertBefore(dragging, afterElement);
        }
    };
    defsCol.ondrop = (e) => {
        e.preventDefault();
        const fromIdx = +e.dataTransfer.getData('text/plain');
        const draggingDef = definitions[fromIdx];
        // Определяем, куда вставить
        const afterElement = getDragAfterElement(defsCol, e.clientY);
        let toIdx = definitions.length;
        if (afterElement) {
            toIdx = +afterElement.dataset.index;
        }
        // Удаляем и вставляем
        definitions.splice(fromIdx, 1);
        definitions.splice(toIdx, 0, draggingDef);
        renderDefs();
    };

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.matching-def:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: -Infinity }).element;
    }

    matchingContainer.appendChild(termsCol);
    matchingContainer.appendChild(defsCol);
    container.appendChild(matchingContainer);

    // Сохраняем результат в DOM для последующей проверки
    container.dataset.matchingResult = JSON.stringify(definitions);
}

let selectedMatchingItem = null;

function handleMatchingClick(item) {
    if (item.classList.contains('matched')) return;
    
    if (selectedMatchingItem) {
        if (selectedMatchingItem.dataset.type !== item.dataset.type) {
            // Создаем пару
            selectedMatchingItem.classList.add('matched');
            item.classList.add('matched');
            selectedMatchingItem = null;
        } else {
            // Отменяем предыдущий выбор
            selectedMatchingItem.classList.remove('selected');
            selectedMatchingItem = item;
            item.classList.add('selected');
        }
    } else {
        selectedMatchingItem = item;
        item.classList.add('selected');
    }
}

function renderImageQuestion(container, question) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container mb-3';
    
    const img = document.createElement('img');
    img.src = question.imageUrl;
    img.className = 'img-fluid';
    img.alt = 'Изображение к вопросу';
    
    imageContainer.appendChild(img);
    container.appendChild(imageContainer);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.dataset.questionId = question.id;
    input.placeholder = 'Введите ваш ответ...';
    container.appendChild(input);
}

function renderLatexQuestion(container, question) {
    const helpText = document.createElement('div');
    helpText.className = 'alert alert-info mb-3';
    helpText.innerHTML = `
        <strong>Подсказка:</strong> Используйте LaTeX синтаксис. Например:
        <ul>
            <li>\\pi для числа π</li>
            <li>r^2 для r²</li>
            <li>\\sqrt{x} для √x</li>
        </ul>
    `;
    container.appendChild(helpText);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.dataset.questionId = question.id;
    input.placeholder = 'Введите формулу в формате LaTeX...';
    container.appendChild(input);
    
    const preview = document.createElement('div');
    preview.className = 'latex-preview mt-2 p-2 border rounded';
    preview.style.minHeight = '50px';
    container.appendChild(preview);
    
    // Обновляем предпросмотр при вводе
    input.addEventListener('input', () => {
        preview.innerHTML = `$${input.value}$`;
        MathJax.typeset([preview]);
    });
}

// Восстановление ответов из localStorage
function restoreAnswers() {
    const saved = JSON.parse(localStorage.getItem('userAnswers') || '{}');
    // Открытые вопросы
    document.querySelectorAll('textarea[data-question-id]').forEach(input => {
        if (saved[input.dataset.questionId]) input.value = saved[input.dataset.questionId];
    });
    // Multiple choice: radio
    document.querySelectorAll('input[type="radio"]').forEach(input => {
        if (saved[input.dataset.questionId] && saved[input.dataset.questionId] === input.value) input.checked = true;
    });
    // Multiple choice: checkbox
    document.querySelectorAll('input[type="checkbox"]').forEach(input => {
        if (saved[input.dataset.questionId] && saved[input.dataset.questionId].includes(input.value)) input.checked = true;
    });
    // Для matching и других типов можно добавить восстановление по необходимости
}

// Сохраняем ответы в localStorage при каждом изменении
function saveAnswer(questionId, value) {
    const saved = JSON.parse(localStorage.getItem('userAnswers') || '{}');
    saved[questionId] = value;
    localStorage.setItem('userAnswers', JSON.stringify(saved));
}

document.addEventListener('input', function(e) {
    if (e.target.matches('textarea[data-question-id]')) {
        saveAnswer(e.target.dataset.questionId, e.target.value);
    }
    if (e.target.matches('input[type="radio"]')) {
        saveAnswer(e.target.dataset.questionId, e.target.value);
    }
    if (e.target.matches('input[type="checkbox"]')) {
        const checkboxes = document.querySelectorAll('input[type="checkbox"][data-question-id="' + e.target.dataset.questionId + '"]');
        const checked = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        saveAnswer(e.target.dataset.questionId, checked);
    }
});

function submitTest() {
    console.log('submitTest called');
    console.log('testData.questions:', testData.questions);
    if (testData && testData.questions) {
        testData.questions.forEach(q => console.log('question:', q.id, q.type));
    }
    const answers = [];

    // Открытые вопросы (textarea)
    document.querySelectorAll('textarea[data-question-id]').forEach(input => {
        answers.push({
            questionId: parseInt(input.dataset.questionId),
            answer: input.value
        });
    });

    // Multiple choice: radio (closed)
    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(input => {
        if (!radioGroups[input.name]) radioGroups[input.name] = [];
        radioGroups[input.name].push(input);
    });
    Object.values(radioGroups).forEach(group => {
        const checked = group.find(input => input.checked);
        if (checked) {
            const letter = String.fromCharCode(97 + parseInt(checked.value));
            answers.push({
                questionId: parseInt(checked.dataset.questionId),
                answer: letter
            });
        }
    });

    // Multiple choice: checkbox (multiclosed)
    const checkboxGroups = {};
    document.querySelectorAll('input[type="checkbox"]').forEach(input => {
        if (!checkboxGroups[input.name]) checkboxGroups[input.name] = [];
        checkboxGroups[input.name].push(input);
    });
    Object.values(checkboxGroups).forEach(group => {
        const checked = group.filter(input => input.checked);
        if (checked.length > 0) {
            const letters = checked.map(input => String.fromCharCode(97 + parseInt(input.value)));
            answers.push({
                questionId: parseInt(checked[0].dataset.questionId),
                answer: letters.join(',')
            });
        }
    });

    // Matching (соответствие)
    testData.questions.filter(q => q.type === 'matching' || q.type === 'pairs').forEach(question => {
        console.log('matching id:', question.id);
        const container = document.querySelector(`[data-question-id-matching='${question.id}']`);
        console.log('matching container:', container);
        if (!container) return;
        // Собрать термины и определения по порядку
        const terms = Array.from(container.querySelectorAll('.col-6')[0].children).map(div => div.textContent.trim());
        const defs = Array.from(container.querySelectorAll('.col-6')[1].children).map(div => div.textContent.trim());
        // Формируем пары
        const pairs = terms.map((term, i) => ({ term, definition: defs[i] || '' }));
        console.log('matching terms:', terms);
        console.log('matching defs:', defs);
        console.log('matching pairs:', pairs);
        answers.push({
            questionId: question.id,
            answer: pairs
        });
    });
    console.log('answers after matching:', answers);
    
    const studentInfo = JSON.parse(localStorage.getItem('studentInfo'));
    console.log('answers:', answers);
    console.log('studentInfo:', studentInfo);
    console.log('testId:', testData && testData.id);

    // Время прохождения теста
    const startTime = parseInt(localStorage.getItem('testStartTime') || Date.now());
    const durationMs = Date.now() - startTime;
    const durationSec = Math.floor(durationMs / 1000);

    // Отправляем результаты
    fetch('http://localhost:3000/api/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            testId: testData.id,
            answers,
            studentInfo,
            durationSec
        })
    })
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url;
        } else {
            return response.text().then(text => {
                document.body.innerHTML = text;
            });
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке результатов:', error);
        alert('Не удалось отправить результаты');
    });

    // Очищаем время и ответы после отправки
    localStorage.removeItem('testStartTime');
    localStorage.removeItem('userAnswers');
} 