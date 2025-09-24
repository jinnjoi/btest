document.addEventListener('DOMContentLoaded', async () => {
    const testSelect = document.getElementById('testSelect');
    const startForm = document.getElementById('startForm');

    // Загрузка списка тестов
    try {
        const response = await fetch('/api/tests');
        const tests = await response.json();
        
        tests.forEach(test => {
            const option = document.createElement('option');
            option.value = test.id;
            option.textContent = `${test.title} (${test.timeLimit} мин.)`;
            testSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка при загрузке тестов:', error);
        alert('Не удалось загрузить список тестов');
    }

    // Функция для показа Bootstrap-оповещения
    function showBootstrapAlert(message) {
        let alert = document.getElementById('passcodeAlert');
        if (!alert) {
            alert = document.createElement('div');
            alert.id = 'passcodeAlert';
            alert.className = 'alert alert-danger mt-3';
            alert.role = 'alert';
            startForm.parentNode.insertBefore(alert, startForm);
        }
        alert.textContent = message;
        alert.style.display = 'block';
        setTimeout(() => { if (alert) alert.style.display = 'none'; }, 4000);
    }

    // Обработка отправки формы
    startForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const studentInfo = {
            fullName: document.getElementById('fullName').value,
            group: document.getElementById('group').value,
            codeWord: document.getElementById('codeWord').value
        };
        const selectedTestId = testSelect.value;
        const passcode = studentInfo.codeWord;

        // Проверяем кодовое слово через API
        try {
            const res = await fetch(`/api/tests/${selectedTestId}/passcode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode })
            });
            if (res.ok) {
                // Сохраняем информацию о студенте в localStorage
                localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
                localStorage.setItem('selectedTestId', selectedTestId);
                window.location.href = 'test.html';
            } else {
                const data = await res.json();
                showBootstrapAlert(data.error || 'Ошибка проверки кода!');
            }
        } catch (err) {
            showBootstrapAlert('Ошибка соединения с сервером!');
        }
    });
}); 