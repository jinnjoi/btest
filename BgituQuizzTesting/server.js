const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');
const natural = require('natural'); // Для косинусной близости
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 1. Получение списка тестов (только id и название)
app.get('/api/tests', async (req, res) => {
    try {
        const tests = await prisma.quiz_test.findMany({
            select: {
                id: true,
                name: true,
                timer: true
            }
        });
        res.json(tests.map(test => ({
            id: test.id.toString(),
            title: test.name,
            timeLimit: test.timer
        })));
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при получении тестов', details: error.message });
    }
});

// 2. Проверка кода доступа (passcode)
app.post('/api/tests/:id/passcode', async (req, res) => {
    const { passcode } = req.body;
    try {
        const test = await prisma.quiz_test.findUnique({
            where: { id: BigInt(req.params.id) },
            select: { codepass: true }
        });
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        // Если кодовое слово не задано (null, undefined, пустая строка)
        if (!test.codepass) {
            // Если пользователь ничего не ввёл — пускаем
            if (!passcode || passcode === '') {
                return res.json({ success: true });
            } else {
                // Если пользователь что-то ввёл, а кодовое слово не требуется — ошибка
                return res.status(401).json({ error: 'Код доступа не требуется для этого теста' });
            }
        }
        // Если кодовое слово задано — сравниваем
        if (test.codepass === passcode) {
            return res.json({ success: true });
        } else {
            return res.status(401).json({ error: 'Неверный код доступа' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при проверке кода доступа', details: error.message });
    }
});

// 3. Получение вопросов теста с учётом блоков и количества
app.get('/api/tests/:id/questions', async (req, res) => {
    function parseOptionsFromQuestion(text) {
        // Ищет варианты вида a) ...\nb) ...\nc) ...
        const regex = /([a-zа-яё])\)\s([^\n]+)/gi;
        let match;
        const options = [];
        while ((match = regex.exec(text)) !== null) {
            options.push({ key: match[1], text: match[2].trim() });
        }
        return options;
    }
    function parsePairsFromQuestion(text) {
        // Делит на две части: номера и буквы
        // Пример: 1. ...\n2. ...\nA. ...\nB. ...
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const left = [], right = [];
        for (const line of lines) {
            if (/^\d+\./.test(line)) left.push(line);
            else if (/^[A-ZА-ЯЁ]\./.test(line)) right.push(line);
        }
        return { left, right };
    }
    try {
        const testId = BigInt(req.params.id);
        // Получаем тест с блоками и настройками количества вопросов
        const test = await prisma.quiz_test.findUnique({
            where: { id: testId },
            select: {
                id: true,
                name: true,
                description: true,
                timer: true,
                quiz_testblock: {
                    select: {
                        quiz_block: {
                            select: {
                                id: true,
                                name: true,
                                num_questions: true // сколько вопросов брать из блока
                            }
                        }
                    }
                },
                quiz_test_questions: {
                    select: {
                        quiz_question: {
                            select: {
                                id: true,
                                question: true,
                                type: true,
                                answer: true,
                                points: true,
                                block_id: true,
                                block_name: true,
                                quiz_block: {
                                    select: { name: true }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        // Группируем вопросы по блокам
        const blockMap = {};
        for (const b of test.quiz_testblock) {
            blockMap[b.quiz_block.id.toString()] = {
                name: b.quiz_block.name,
                count: b.quiz_block.num_questions || 0,
                questions: []
            };
        }
        for (const q of test.quiz_test_questions) {
            const qq = q.quiz_question;
            if (qq.block_id && blockMap[qq.block_id.toString()]) {
                blockMap[qq.block_id.toString()].questions.push(qq);
            }
        }
        // Для каждого блока выбираем случайные N вопросов
        const selectedQuestions = [];
        for (const blockId in blockMap) {
            const block = blockMap[blockId];
            let questions = block.questions;
            // Перемешиваем
            questions = questions.sort(() => Math.random() - 0.5);
            // Берём нужное количество
            questions = questions.slice(0, block.count);
            // Форматируем вопросы
            for (const qq of questions) {
                let options = undefined, pairs = undefined;
                if (qq.type === 'closed' || qq.type === 'multiclosed') {
                    options = parseOptionsFromQuestion(qq.question).map(opt => opt.text);
                }
                if (qq.type === 'pairs') {
                    const lines = qq.question.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    const terms = lines.filter(l => /^\d+\./.test(l));
                    const definitions = lines.filter(l => /^[A-ZА-ЯЁ]\./.test(l));
                    pairs = terms.map((term, i) => ({
                        term,
                        definition: definitions[i] || ''
                    }));
                }
                selectedQuestions.push({
                    id: qq.id.toString(),
                    block: qq.block_name || (qq.quiz_block ? qq.quiz_block.name : ''),
                    type: qq.type,
                    text: qq.question,
                    options,
                    pairs,
                    answer: qq.answer, // всегда возвращаем как есть
                    imageUrl: qq.type === 'image' ? qq.answer : undefined,
                    points: qq.points
                });
            }
        }
        res.json({
            id: test.id.toString(),
            title: test.name,
            description: test.description,
            timeLimit: test.timer,
            questions: selectedQuestions
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при получении вопросов', details: error.message });
    }
});

// Получение информации о тесте по id (с блоками и вопросами)
app.get('/api/tests/:id', async (req, res) => {
    function parseQuestionAndOptions(text) {
        // Делит текст на вопрос и варианты (a) ... b) ...)
        const lines = text.split(/\r?\n/);
        let questionText = '';
        const options = [];
        let foundOption = false;
        for (const line of lines) {
            const match = line.match(/^([a-zа-яё])\)\s*(.+)$/i);
            if (match) {
                foundOption = true;
                options.push(match[2].trim());
            } else if (!foundOption) {
                questionText += (questionText ? ' ' : '') + line.trim();
            }
        }
        return { questionText, options };
    }

    function parseMatchingTermsAndDefs(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const terms = lines.filter(l => /^\d+\./.test(l));
        const definitions = lines.filter(l => /^[A-ZА-ЯЁ]\./.test(l));
        return { terms, definitions };
    }

    try {
        const testId = BigInt(req.params.id);
        const test = await prisma.quiz_test.findUnique({
            where: { id: testId },
            select: {
                id: true,
                name: true,
                description: true,
                timer: true,
                quiz_testblock: {
                    select: {
                        num_questions: true,
                        quiz_block: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                quiz_test_questions: {
                    select: {
                        quiz_question: {
                            select: {
                                id: true,
                                question: true,
                                type: true,
                                answer: true,
                                points: true,
                                block_id: true,
                                block_name: true,
                                quiz_block: {
                                    select: { name: true }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        // Формируем массив блоков
        const blocks = test.quiz_testblock.map(b => ({
            id: b.quiz_block.id.toString(),
            name: b.quiz_block.name,
            questionsCount: b.num_questions || 0
        }));
        // Формируем массив вопросов
        const questions = test.quiz_test_questions.map(q => {
            const qq = q.quiz_question;
            let type = qq.type;
            let options = undefined, pairs = undefined;
            let text = qq.question;
            const originalType = qq.type;

            if (type === 'closed' || type === 'multiclosed') {
                type = 'multiple_choice';
                const parsed = parseQuestionAndOptions(qq.question);
                text = parsed.questionText;
                options = parsed.options;
            }
            if (type === 'pairs') {
                type = 'matching';
                text = 'Соедините понятия и определения';
                pairs = parseMatchingTermsAndDefs(qq.question);
            }

            return {
                id: qq.id.toString(),
                block: qq.block_name || (qq.quiz_block ? qq.quiz_block.name : ''),
                type,
                originalType,
                text,
                options,
                pairs,
                answer: qq.answer,
                points: qq.points
            };
        });
        res.json({
            id: test.id.toString(),
            title: test.name,
            description: test.description,
            timeLimit: test.timer,
            blocks,
            questions
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при получении теста', details: error.message });
    }
});

function cosineSimilarity(str1, str2) {
    // Быстрая косинусная близость по токенам
    const tokenizer = new natural.WordTokenizer();
    const tokens1 = tokenizer.tokenize(str1.toLowerCase());
    const tokens2 = tokenizer.tokenize(str2.toLowerCase());
    const allTokens = Array.from(new Set([...tokens1, ...tokens2]));
    const vec1 = allTokens.map(t => tokens1.filter(x => x === t).length);
    const vec2 = allTokens.map(t => tokens2.filter(x => x === t).length);
    const dot = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
    if (norm1 === 0 || norm2 === 0) return 0;
    return dot / (norm1 * norm2);
}

function normalizePairsString(str) {
    return str
        .replace(/\r/g, '')
        .split('\n')
        .map(line => line.trim().replace(/[-–—]/, '–').replace(/\s*–\s*/, ' – ').toUpperCase())
        .filter(Boolean)
        .join('\n');
}

function normalizeLetter(letter) {
    // Русско-латинские аналоги
    const map = {
        'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
        'A': 'A', 'B': 'B', 'E': 'E', 'K': 'K', 'M': 'M', 'H': 'H', 'O': 'O', 'P': 'P', 'C': 'C', 'T': 'T', 'Y': 'Y', 'X': 'X'
    };
    const upper = (letter || '').toUpperCase();
    return map[upper] || upper;
}

app.post('/api/submit', async (req, res) => {
    const { testId, answers, studentInfo, durationSec } = req.body;
    try {
        const test = await prisma.quiz_test.findUnique({
            where: { id: BigInt(testId) },
            include: {
                quiz_test_questions: {
                    include: { quiz_question: true }
                }
            }
        });
        if (!test) {
            return res.status(404).send('Тест не найден');
        }
        const questions = test.quiz_test_questions.map(q => q.quiz_question);
        let totalScore = 0;
        const results = [];
        for (const question of questions) {
            const answerObj = answers.find(a => a.questionId.toString() === question.id.toString());
            let score = 0;
            let answer = answerObj ? answerObj.answer : '';
            let correctAnswer = question.answer;
            let userAnswer = answer;
            let text = question.question;
            switch (question.type) {
                case 'open': {
                    const isLatex = question.answer.includes('$');
                    if (answerObj) {
                        if (isLatex) {
                            score = (answer.replace(/\s/g, '') === question.answer.replace(/\s/g, '')) ? question.points : 0;
                        } else {
                            const sim = cosineSimilarity(answer, question.answer);
                            score = sim * question.points;
                        }
                    }
                    break;
                }
                case 'multiclosed': {
                    let correct = [];
                    if (Array.isArray(question.answer)) {
                        correct = question.answer;
                    } else if (typeof question.answer === 'string') {
                        try { correct = JSON.parse(question.answer); } catch { correct = question.answer.split(','); }
                    }
                    const user = typeof answer === 'string' ? answer.split(',') : Array.isArray(answer) ? answer : [];
                    const correctSet = new Set(correct.map(String));
                    const userSet = new Set(user.map(String));
                    const intersection = [...userSet].filter(x => correctSet.has(x));
                    score = (correct.length > 0) ? (intersection.length / correct.length) * question.points : 0;
                    break;
                }
                case 'closed': {
                    if (answerObj) {
                        score = (String(answer).trim() === String(question.answer).trim()) ? question.points : 0;
                    }
                    break;
                }
                case 'pairs': {
                    let userPairs = [];
                    if (Array.isArray(answer) && answer.length && typeof answer[0] === 'object') {
                        userPairs = answer.map(p => {
                            const termNum = (p.term.match(/^(\d+)/) || [])[1] || p.term;
                            const defLetter = (p.definition.match(/^([A-ZА-ЯЁ])/i) || [])[1] || p.definition;
                            return { term: termNum, definition: defLetter };
                        });
                    } else if (typeof answer === 'string') {
                        userPairs = answer.split(/\r?\n/).map(line => {
                            const m = line.match(/^(\d+)\s*[-–—]\s*([A-ZА-ЯЁ])/i);
                            return m ? { term: m[1], definition: m[2] } : null;
                        }).filter(Boolean);
                    }
                    userAnswer = userPairs.map(p => `${p.term} – ${p.definition}`).join('\n');
                    correctAnswer = (question.answer || '').split(/\r?\n/).map(line => {
                        const m = line.match(/^(\d+)\s*[-–—]\s*([A-ZА-ЯЁ])/i);
                        return m ? `${m[1]} – ${m[2]}` : null;
                    }).filter(Boolean).join('\n');
                    const correctPairs = (question.answer || '').split(/\r?\n/).map(line => {
                        const m = line.match(/^(\d+)\s*[-–—]\s*([A-ZА-ЯЁ])/i);
                        return m ? { term: m[1], definition: m[2] } : null;
                    }).filter(Boolean);
                    let correctCount = 0;
                    correctPairs.forEach(cp => {
                        if (userPairs.find(up => up.term === cp.term && normalizeLetter(up.definition) === normalizeLetter(cp.definition))) {
                            correctCount++;
                        }
                    });
                    score = (correctPairs.length > 0) ? (correctCount / correctPairs.length) * question.points : 0;
                    break;
                }
                default:
                    break;
            }
            totalScore += score;
            results.push({
                questionId: question.id.toString(),
                text,
                userAnswer,
                correctAnswer,
                score,
                maxScore: question.points
            });
        }
        const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
        // Сохраняем результат в БД (quiz_testresult)
        const now = new Date();
        const startedAt = new Date(now.getTime() - (typeof durationSec === 'number' ? durationSec : 0) * 1000);
        await prisma.quiz_testresult.create({
            data: {
                student_full_name: studentInfo.fullName || '',
                student_group: studentInfo.group || '',
                total_score: totalScore,
                max_score: maxScore,
                percent: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
                started_at: startedAt,
                finished_at: now,
                duration_sec: typeof durationSec === 'number' ? durationSec : 0,
                details: results,
                test_id: BigInt(testId),
                created_at: now
            }
        });
        res.render('results', {
            studentInfo,
            totalScore,
            maxScore,
            results,
            durationSec: typeof durationSec === 'number' ? durationSec : 0
        });
    } catch (error) {
        res.status(500).send('Ошибка при отправке результатов: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
}); 