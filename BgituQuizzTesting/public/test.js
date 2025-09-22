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
        const response = await fetch(`/api/tests/${testId}/questions`);
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

function splitQuestionAndOptions(html) {
    // Оставляем только текст и <img>
    const temp = document.createElement('div');
    temp.innerHTML = html;
    function clean(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName.toLowerCase() === 'img') {
                return node.outerHTML;
            } else {
                let result = '';
                node.childNodes.forEach(child => {
                    result += clean(child);
                });
                return result;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        return '';
    }
    const onlyTextAndImg = clean(temp);

    // Ищем все метки вариантов
    const optionRegex = /([a-zA-Zа-яА-ЯёЁ0-9])\)/g;
    let match, indices = [];
    while ((match = optionRegex.exec(onlyTextAndImg)) !== null) {
        indices.push({ label: match[1], index: match.index });
    }
    let options = [];
    for (let i = 0; i < indices.length; i++) {
        const start = indices[i].index;
        const end = i + 1 < indices.length ? indices[i + 1].index : onlyTextAndImg.length;
        let content = onlyTextAndImg.slice(start, end).trim();
        options.push(content);
    }
    // Вопрос — всё до первой метки, варианты — дальше
    const questionPart = indices.length > 0 ? onlyTextAndImg.slice(0, indices[0].index).trim() : onlyTextAndImg;
    return { question: questionPart, options: options };
}

function appendTextAndImagesOnlyToElement(element, htmlString) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    function recursiveAppend(node, target) {
        for (let child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                target.appendChild(document.createTextNode(child.textContent));
            } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'IMG') {
                target.appendChild(child.cloneNode(true));
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                recursiveAppend(child, target);
            }
        }
    }
    recursiveAppend(temp, element);
}

function splitMatchingQuestionAndAnswers(html) {
    // 1. Оставляем только текст и <img>
    const temp = document.createElement('div');
    temp.innerHTML = html;
    function clean(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName.toLowerCase() === 'img') {
                return node.outerHTML;
            } else {
                let result = '';
                node.childNodes.forEach(child => {
                    result += clean(child);
                });
                return result;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        return '';
    }
    let onlyTextAndImg = clean(temp);

    // Удаляем всё до первой метки (1. или A.)
    const firstMatch = onlyTextAndImg.match(/([0-9]+|[A-ZА-ЯЁ])\./i);
    if (firstMatch && firstMatch.index > 0) {
        onlyTextAndImg = onlyTextAndImg.slice(firstMatch.index);
    }

    const regex = /([0-9]+|[A-ZА-ЯЁ])\.\s*([\s\S]*?)(?=([0-9]+|[A-ZА-ЯЁ])\.|$)/gmi;
    const terms = [];
    const definitions = [];
    let match;
    while ((match = regex.exec(onlyTextAndImg)) !== null) {
        const label = match[1];
        const content = match[2].trim();
        if (/^[0-9]+$/.test(label)) {
            terms.push(content);
        } else {
            definitions.push(content);
        }
    }
    return { terms, definitions };
}

function renderQuestions() {
    console.log('testData:', testData);
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

        let questionText = question.text;
        let options = [];
        if (question.type === 'multiple_choice') {
            const split = splitQuestionAndOptions(question.text);
            questionText = split.question;
            options = split.options;
        }
        const text = document.createElement('div');
        text.className = 'question-text';
        appendTextAndImagesOnlyToElement(text, questionText);
        questionCard.appendChild(header);
        questionCard.appendChild(text);

        switch (question.type) {
            case 'open':
                renderOpenQuestion(questionCard, question);
                break;
            case 'multiple_choice':
                renderMultipleChoiceQuestion(questionCard, { ...question, options });
                break;
            case 'matching':
            case 'pairs': {
                // Используем variantsHtml если есть, иначе text
                const htmlForMatching = question.variantsHtml || question.text;
                console.log('matching question:', question);
                console.log('Передаю в splitMatchingQuestionAndAnswers:', htmlForMatching);
                const { terms, definitions } = splitMatchingQuestionAndAnswers(htmlForMatching);
                renderMatchingQuestion(questionCard, { ...question, pairs: { terms, definitions } });
                break;
            }
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

function appendTextAndImagesOnly(label, htmlString) {
    // 1. Оставляем только текст и <img>
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    function clean(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName.toLowerCase() === 'img') {
                return node.outerHTML;
            } else {
                let result = '';
                node.childNodes.forEach(child => {
                    result += clean(child);
                });
                return result;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        return '';
    }
    const onlyTextAndImg = clean(temp);

    // 2. Разбиваем по меткам вариантов (a), б), c), d), 1), А), Б) и т.д.)
    const optionRegex =/(?:^|\n)([a-zA-Zа-яА-ЯёЁ0-9])\)/g;;
    let match, indices = [];
    while ((match = optionRegex.exec(onlyTextAndImg)) !== null) {
        indices.push({ label: match[1], index: match.index });
    }
    // Если вариантов нет или только один, работаем по-старому
    if (indices.length <= 1) {
        // Старое поведение: просто текст и картинки
        const temp2 = document.createElement('div');
        temp2.innerHTML = htmlString;
        function recursiveAppend(node, target) {
            for (let child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    target.appendChild(document.createTextNode(child.textContent));
                } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'IMG') {
                    target.appendChild(child.cloneNode(true));
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    recursiveAppend(child, target);
                }
            }
        }
        recursiveAppend(temp2, label);
        return;
    }
    // 3. Парсим варианты
    for (let i = 0; i < indices.length; i++) {
        const start = indices[i].index;
        const end = i + 1 < indices.length ? indices[i + 1].index : onlyTextAndImg.length;
        let content = onlyTextAndImg.slice(start, end).trim();
        // 4. Вытаскиваем <img> и текст
        let images = [];
        content = content.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/g, (m, src) => {
            images.push(src);
            return '';
        });
        content = content.replace(/(https?:\/\/[^)\s<>\"']+?\.(jpg|jpeg|png|gif|webp))/gi, (m, url) => {
            images.push(url);
            return '';
        });
        // 5. Добавляем в label: буква, текст, картинки
        const letterMatch = content.match(optionRegex);
        let letter = indices[i].label;
        let text = content.replace(optionRegex, '').trim();
        // Буква и скобка
        label.appendChild(document.createTextNode(letter + ') '));
        if (text) label.appendChild(document.createTextNode(text + ' '));
        images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.className = 'img-fluid option-img';
            img.alt = 'Изображение к варианту';
            label.appendChild(img);
        });
        // Перенос строки между вариантами, кроме последнего
        if (i < indices.length - 1) {
            label.appendChild(document.createElement('br'));
        }
    }
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
        input.id = `q${question.id}_opt${index}`;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', input.id);
        appendTextAndImagesOnly(label, option);

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

    // Цвета для пар (можно расширить)
    const pairColors = [
        '#ffd966', '#a4c2f4', '#b6d7a8', '#f4cccc', '#d9d2e9', '#f9cb9c', '#cfe2f3', '#ead1dc', '#fff2cc', '#d0e0e3'
    ];

    // Состояние: пары (массив объектов {left: i, right: j, color}), выбранный элемент
    let pairs = [];
    let selected = null; // {side: 'left'|'right', index: number, el: HTMLElement}

    // Первый столбик — термины (цифры)
    const termsCol = document.createElement('div');
    termsCol.className = 'col-6';
    const leftNodes = [];
    (question.pairs.terms || []).forEach((term, i) => {
        const div = document.createElement('div');
        div.className = 'matching-term mb-2 p-2 border bg-light';
        // Добавляем номер
        const numSpan = document.createElement('span');
        numSpan.style.fontWeight = 'bold';
        numSpan.textContent = (i + 1) + '. ';
        div.appendChild(numSpan);
        appendTextAndImagesOnlyToElement(div, term);
        div.dataset.index = i;
        div.dataset.side = 'left';
        div.style.cursor = 'pointer';
        leftNodes.push(div);
        termsCol.appendChild(div);
    });

    // Второй столбик — определения (буквы)
    const defsCol = document.createElement('div');
    defsCol.className = 'col-6';
    const rightNodes = [];
    (question.pairs.definitions || []).forEach((definition, j) => {
        const div = document.createElement('div');
        div.className = 'matching-def mb-2 p-2 border bg-white';
        // Добавляем букву
        const letterSpan = document.createElement('span');
        letterSpan.style.fontWeight = 'bold';
        letterSpan.textContent = String.fromCharCode(65 + j) + '. ';
        div.appendChild(letterSpan);
        appendTextAndImagesOnlyToElement(div, definition);
        div.dataset.index = j;
        div.dataset.side = 'right';
        div.style.cursor = 'pointer';
        rightNodes.push(div);
        defsCol.appendChild(div);
    });

    // Функция для обновления цветов
    function updateColors() {
        // Сбросить все
        leftNodes.forEach(div => {
            div.style.backgroundColor = '';
            div.style.outline = '';
            div.style.boxShadow = '';
            div.classList.remove('selected');
        });
        rightNodes.forEach(div => {
            div.style.backgroundColor = '';
            div.style.outline = '';
            div.style.boxShadow = '';
            div.classList.remove('selected');
        });
        // Окрасить пары рамкой
        pairs.forEach((pair, idx) => {
            const color = pairColors[idx % pairColors.length];
            if (leftNodes[pair.left]) leftNodes[pair.left].style.outline = `2px solid ${color}`;
            if (rightNodes[pair.right]) rightNodes[pair.right].style.outline = `2px solid ${color}`;
        });
        // Выделить выбранный (поверх цветной рамки)
        if (selected) {
            const arr = selected.side === 'left' ? leftNodes : rightNodes;
            if (arr[selected.index]) {
                arr[selected.index].classList.add('selected');
                arr[selected.index].style.outline = '2px solid #007bff';
                arr[selected.index].style.boxShadow = '0 0 0 2px #007bff33';
            }
        }
        // Обновляем matchingResult в DOM
        container.dataset.matchingResult = JSON.stringify(pairs);
    }

    // Клик по элементу
    function handleClick(side, index, el) {
        console.log('CLICK', side, index, el);
        // Если этот элемент уже в паре — ничего не делаем
        if (pairs.some(pair => pair[side] === index)) return;
        // Если выбран элемент с той же стороны — снять выделение
        if (selected && selected.side === side && selected.index === index) {
            selected = null;
            updateColors();
            return;
        }
        // Если выбран элемент с другой стороны — формируем пару
        if (selected && selected.side !== side) {
            // Удаляем старую пару, если этот элемент уже был в паре
            pairs = pairs.filter(pair => pair.left !== (side === 'left' ? index : selected.index) && pair.right !== (side === 'right' ? index : selected.index));
            // Добавляем новую пару
            const leftIdx = side === 'left' ? index : selected.index;
            const rightIdx = side === 'right' ? index : selected.index;
            pairs.push({ left: leftIdx, right: rightIdx });
            selected = null;
            updateColors();
            return;
        }
        // Просто выделяем этот элемент
        selected = { side, index, el };
        updateColors();
    }

    // Навешиваем обработчики через addEventListener
    leftNodes.forEach((div, i) => {
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClick('left', i, div);
        });
    });
    rightNodes.forEach((div, j) => {
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClick('right', j, div);
        });
    });

    updateColors();

    matchingContainer.appendChild(termsCol);
    matchingContainer.appendChild(defsCol);
    container.appendChild(matchingContainer);
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

document.addEventListener('input', function (e) {
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
        const container = document.querySelector(`[data-question-id-matching='${question.id}']`);
        if (!container) return;
        const pairs = JSON.parse(container.dataset.matchingResult || '[]');
        // Формируем ответ в формате 1 – C, 2 – E и т.д.
        const answerLines = pairs.map(pair => {
            const num = (pair.left + 1).toString();
            const letter = String.fromCharCode(65 + pair.right);
            return `${num} – ${letter}`;
        });
        answers.push({
            questionId: question.id,
            answer: answerLines.join('\n')
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
    fetch('/api/submit', {
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