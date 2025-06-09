document.addEventListener('DOMContentLoaded', () => {
    const results = JSON.parse(localStorage.getItem('testResults'));
    if (!results) {
        window.location.href = 'index.html';
        return;
    }

    const studentInfo = JSON.parse(localStorage.getItem('studentInfo')) || {};
    const fullName = studentInfo.fullName || 'Неизвестно';
    const group = studentInfo.group || 'Неизвестно';

    // Отображаем информацию о студенте
    document.getElementById('studentName').textContent = fullName;
    document.getElementById('studentGroup').textContent = group;

    // Отображаем общие результаты
    const score = results && typeof results.totalScore === 'number' ? results.totalScore : 0;
    const maxScore = results && typeof results.maxScore === 'number' ? results.maxScore : 0;
    const scoreElem = document.getElementById('totalScore');
    const maxScoreElem = document.getElementById('maxScore');
    if (scoreElem) scoreElem.textContent = score.toFixed(2);
    if (maxScoreElem) maxScoreElem.textContent = maxScore.toFixed(2);

    // Обновляем прогресс-бар
    const progressBar = document.getElementById('scoreProgress');
    const percentage = (results.totalScore / results.maxScore) * 100;
    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);

    // Определяем цвет прогресс-бара
    if (percentage >= 80) {
        progressBar.className = 'progress-bar bg-success';
    } else if (percentage >= 60) {
        progressBar.className = 'progress-bar bg-warning';
    } else {
        progressBar.className = 'progress-bar bg-danger';
    }

    // Отображаем детальные результаты
    const detailedResults = document.getElementById('detailedResults');
    const detailed = Array.isArray(results.results) ? results.results : [];
    detailed.forEach((result, index) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'mb-3';
        resultDiv.innerHTML = `
            <h5>Вопрос ${index + 1}</h5>
            <div class="progress">
                <div class="progress-bar" role="progressbar" 
                     style="width: ${(result.score / result.maxScore) * 100}%"
                     aria-valuenow="${result.score}"
                     aria-valuemin="0"
                     aria-valuemax="${result.maxScore}">
                    ${result.score.toFixed(1)} / ${result.maxScore}
                </div>
            </div>
        `;
        detailedResults.appendChild(resultDiv);
    });

    // Очищаем localStorage
    localStorage.removeItem('testResults');
    localStorage.removeItem('studentInfo');
    localStorage.removeItem('selectedTestId');
}); 