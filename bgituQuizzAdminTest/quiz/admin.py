from django.contrib import admin
from import_export.admin import ImportExportModelAdmin
from import_export import resources, fields
from import_export.widgets import ForeignKeyWidget
from unfold.admin import ModelAdmin
from .models import Test, Block, Question, TestBlock, TestResult, Discipline, Competence
import os
import pandas as pd
from django.shortcuts import redirect, render
from django.urls import path
from django.contrib import messages
from .forms import ImportForm, SmartTestForm
import random

# Класс-миксин для Unfold и ImportExport
class UnfoldImportExportAdmin(ImportExportModelAdmin, ModelAdmin):
    pass

# --- Ресурсы для import-export ---

class QuestionResource(resources.ModelResource):
    # Явно указываем поля и виджеты для связей
    block = fields.Field(
        column_name='block',
        attribute='block',
        widget=ForeignKeyWidget(Block, 'name'))
    discipline = fields.Field(
        column_name='discipline',
        attribute='discipline',
        widget=ForeignKeyWidget(Discipline, 'name'))
    competence = fields.Field(
        column_name='competence',
        attribute='competence',
        widget=ForeignKeyWidget(Competence, 'name'))

    class Meta:
        model = Question
        fields = ('id', 'block', 'discipline', 'competence', 'question', 'type', 'points', 'answer')
        export_order = fields
        # Используем текст вопроса как уникальный идентификатор для избежания дублей
        import_id_fields = ('question',)
        skip_unchanged = True
        report_skipped = False

    def before_import(self, dataset, using_transactions=None, dry_run=False, **kwargs):
        """
        Перед импортом всего набора данных.
        Используется для создания Блока из имени файла.
        """
        if hasattr(self, 'block_name'):
            block_name = self.block_name
            Block.objects.get_or_create(name=block_name)
            # Добавляем колонку блока в датасет, если ее нет
            if 'block' not in dataset.headers:
                dataset.append_col([block_name] * len(dataset), header='block')

    def before_import_row(self, row, **kwargs):
        """
        Перед импортом каждой строки.
        Используется для создания Дисциплины и Компетенции из строк.
        """
        if 'discipline' in row and row['discipline']:
            Discipline.objects.get_or_create(name=row['discipline'])
        if 'competence' in row and row['competence']:
            Competence.objects.get_or_create(name=row['competence'])


# --- Админ-классы ---

@admin.register(Question)
class QuestionAdmin(UnfoldImportExportAdmin):
    resource_class = QuestionResource
    list_display = ('question', 'block', 'discipline', 'competence', 'type', 'points')
    list_filter = ('block', 'discipline', 'competence', 'type')
    search_fields = ('question', 'block__name', 'discipline__name', 'competence__name')
    
    change_list_template = "admin/quiz/question_changelist.html"

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path('import/', self.import_action, name='quiz_question_import'),
        ]
        return my_urls + urls

    def import_action(self, request):
        if request.method == 'POST':
            form = ImportForm(request.POST, request.FILES)
            if form.is_valid():
                file = request.FILES['import_file']
                block_name = os.path.splitext(file.name)[0]
                
                try:
                    df = pd.read_excel(file, engine='openpyxl')
                    resource = self.resource_class()
                    
                    # Устанавливаем block_name как атрибут объекта-ресурса
                    resource.block_name = block_name
                    
                    dataset = resource.export()
                    dataset.df = df

                    # Убираем block_name из вызова, он теперь в самом объекте
                    result = resource.import_data(dataset, dry_run=False)

                    if not result.has_errors():
                        messages.success(request, f'Импорт для блока "{block_name}" успешно завершен.')
                    else:
                        messages.error(request, f'Во время импорта возникли ошибки. Ниже приведена детальная информация:')
                        for invalid_row in result.invalid_rows:
                            row_number = invalid_row.number
                            errors = "; ".join([f"{field}: {', '.join(errs)}" for field, errs in invalid_row.error_dict.items()])
                            row_data = ", ".join([f"{k}='{v}'" for k, v in invalid_row.values.items()])
                            messages.warning(request, f"Строка {row_number}: {errors} (данные: {row_data})")
                        for error in result.base_errors:
                             messages.error(request, f"Общая ошибка: {error.error}")

                except Exception as e:
                    messages.error(request, f'Произошла критическая ошибка при обработке файла: {e}')

                return redirect('..')
        else:
            form = ImportForm()
        
        # Добавляем стандартный контекст админки
        context = self.admin_site.each_context(request)
        context['form'] = form
        context['opts'] = self.model._meta
        
        return render(request, "admin/import_form.html", context)

@admin.register(Discipline)
class DisciplineAdmin(ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

@admin.register(Competence)
class CompetenceAdmin(ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)
    
@admin.register(Test)
class TestAdmin(ModelAdmin):
    list_display = ('id', 'name', 'created_at', 'timer', 'codepass')
    search_fields = ('name',)
    fields = ('name', 'description', 'timer', 'codepass', 'questions', 'created_at', 'disciplines', 'competences')
    readonly_fields = ('created_at',)
    change_list_template = "admin/quiz/test_changelist.html"

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path('smart-add/', self.smart_add_view, name='quiz_test_smart_add'),
        ]
        return my_urls + urls

    def smart_add_view(self, request):
        context = self.admin_site.each_context(request)
        context['opts'] = self.model._meta
        context['title'] = 'Создать тест по правилам'

        if request.method == 'POST':
            form = SmartTestForm(request.POST)

            if form.is_valid():
                data = form.cleaned_data
                
                filtered_questions = Question.objects.filter(
                    block__in=data['blocks'],
                    discipline__in=data['disciplines'],
                    competence__in=data['competences']
                ).distinct()

                available_count = filtered_questions.count()
                requested_count = data['num_questions']

                if available_count < requested_count:
                    form.add_error(None, f'Недостаточно вопросов. Найдено {available_count}, запрошено {requested_count}.')
                else:
                    random_questions = random.sample(list(filtered_questions), requested_count)
                    
                    new_test = Test.objects.create(
                        name=data['name'],
                        description=data['description'],
                        timer=data['timer']
                    )
                    new_test.blocks.set(data['blocks'])
                    new_test.disciplines.set(data['disciplines'])
                    new_test.competences.set(data['competences'])
                    new_test.questions.set(random_questions)
                    
                    messages.success(request, f'Тест "{new_test.name}" успешно создан.')
                    return redirect('..')
            
            # Если дошли сюда, значит, форма невалидна или вопросов не хватило.
            # Повторно рендерим страницу с той же формой, чтобы показать ошибки.
            context['form'] = form
            return render(request, "admin/quiz/test_smart_add.html", context)

        else: # GET request
            form = SmartTestForm()
            context['form'] = form
            return render(request, "admin/quiz/test_smart_add.html", context)

@admin.register(Block)
class BlockAdmin(ModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)

@admin.register(TestResult)
class TestResultAdmin(ModelAdmin):
    list_display = ('student_full_name', 'student_group', 'test', 'total_score', 'max_score', 'percent', 'started_at', 'finished_at', 'duration_sec', 'created_at')
    search_fields = ('student_full_name', 'student_group', 'test__name')
    list_filter = ('test', 'student_group', 'created_at')
    readonly_fields = ('created_at',)

@admin.register(TestBlock)
class TestBlockAdmin(ModelAdmin):
    pass 