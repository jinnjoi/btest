from django.db import models
from ckeditor.fields import RichTextField

# Create your models here.

class TestBlock(models.Model):
    test = models.ForeignKey('Test', on_delete=models.CASCADE)
    block = models.ForeignKey('Block', on_delete=models.CASCADE)
    num_questions = models.PositiveIntegerField(default=1, verbose_name='Количество вопросов из блока')

    class Meta:
        unique_together = ('test', 'block')
        verbose_name = 'Блок в тесте'
        verbose_name_plural = 'Блоки в тесте'

class Test(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название теста')
    description = models.TextField(blank=True, verbose_name='Описание')
    created_at = models.DateTimeField(auto_now_add=True)
    blocks = models.ManyToManyField('Block', through='TestBlock', blank=True, related_name='tests', verbose_name='Блоки')
    disciplines = models.ManyToManyField('Discipline', blank=True, related_name='tests', verbose_name='Дисциплины (для генерации)')
    competences = models.ManyToManyField('Competence', blank=True, related_name='tests', verbose_name='Компетенции (для генерации)')
    questions = models.ManyToManyField('Question', blank=True, related_name='tests', verbose_name='Вопросы')
    timer = models.PositiveIntegerField(default=30, verbose_name='Таймер (минуты)')
    codepass = models.CharField(max_length=255, blank=True, default='', verbose_name='Код доступа')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Тест'
        verbose_name_plural = 'Тесты'

class Block(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название блока')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Блок вопросов'
        verbose_name_plural = 'Блоки вопросов'

class Discipline(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name='Название дисциплины')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Дисциплина'
        verbose_name_plural = 'Дисциплины'

class Competence(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name='Название компетенции')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Компетенция'
        verbose_name_plural = 'Компетенции'

class Question(models.Model):
    TYPE_CHOICES = [
        ('closed', 'Закрытый'),
        ('multiclosed', 'Множественный выбор'),
        ('open', 'Открытый'),
        ('pairs', 'Соответствия'),
    ]
    block = models.ForeignKey(Block, null=True, blank=True, on_delete=models.SET_NULL, verbose_name='Блок')
    discipline = models.ForeignKey(Discipline, on_delete=models.CASCADE, verbose_name='Дисциплина', null=True, blank=True)
    competence = models.ForeignKey(Competence, on_delete=models.CASCADE, verbose_name='Компетенция', null=True, blank=True)
    block_name = models.CharField(max_length=255, blank=True, verbose_name='Название блока (для импорта)')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, verbose_name='Тип вопроса')
    points = models.PositiveIntegerField(default=1, verbose_name='Баллы')
    question = RichTextField(verbose_name='Вопрос')
    answer = models.TextField(verbose_name='Ответ')

    def __str__(self):
        return self.question[:50]

    class Meta:
        verbose_name = 'Вопрос'
        verbose_name_plural = 'Вопросы'

class TestResult(models.Model):
    # Данные о студенте
    student_full_name = models.CharField("ФИО", max_length=255)
    student_group = models.CharField("Группа", max_length=100)
    # Ссылка на тест
    test = models.ForeignKey(Test, on_delete=models.CASCADE, verbose_name="Тест", related_name="results")
    # Баллы
    total_score = models.FloatField("Набрано баллов")
    max_score = models.FloatField("Максимум баллов")
    percent = models.FloatField("Процент", help_text="Процент правильных ответов")
    closed_score = models.FloatField("Баллы за закрытые вопросы", default=0)
    open_score = models.FloatField("Баллы за открытые вопросы", default=0)
    # Время
    started_at = models.DateTimeField("Начало теста")
    finished_at = models.DateTimeField("Окончание теста")
    duration_sec = models.IntegerField("Время прохождения (сек)")
    # Детализация по вопросам
    details = models.JSONField("Детальные ответы")  # массив: [{question_id, text, user_answer, correct_answer, score, max_score}]
    created_at = models.DateTimeField("Создано", auto_now_add=True)

    class Meta:
        verbose_name = "Результат теста"
        verbose_name_plural = "Результаты тестов"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student_full_name} ({self.student_group}) — {self.test.name} ({self.total_score}/{self.max_score})"
