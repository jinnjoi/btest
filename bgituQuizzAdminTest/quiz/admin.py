from django.contrib import admin
from import_export.admin import ImportExportModelAdmin
from import_export import resources, fields
from import_export.results import RowResult, Result
from unfold.admin import ModelAdmin
from .models import Test, Block, Question, TestBlock, TestResult
import os
from import_export.forms import ImportForm
from django.shortcuts import redirect
from django.contrib import messages
import tablib
from django.http import HttpResponse

class TestResource(resources.ModelResource):
    class Meta:
        model = Test
        fields = ()  # Не импортируем стандартные поля

    def export(self, queryset=None, *args, **kwargs):
        import tablib
        # Экспортируем все выбранные тесты
        headers = ['block', 'type', 'points', 'question', 'answer', 'order']
        data = []
        if queryset is None:
            queryset = Test.objects.all()
        for test in queryset:
            for question in test.questions.all():
                data.append([
                    question.block.name if question.block else '',
                    question.type,
                    question.points,
                    question.question,
                    question.answer,
                    question.order,
                ])
        dataset = tablib.Dataset(*data, headers=headers)
        return dataset

    def import_data(self, dataset, dry_run=False, raise_errors=False, use_transactions=None, import_filename=None, **kwargs):
        import os
        from import_export.results import Result

        if dry_run:
            return Result()  # Не создаём ничего в базе при dry_run

        # Используем имя файла из import_filename, если оно есть
        if import_filename:
            file_name = os.path.splitext(os.path.basename(import_filename))[0]
        else:
            file_name = getattr(dataset, 'filename', None)
            if file_name:
                file_name = os.path.splitext(os.path.basename(file_name))[0]
            else:
                file_name = "Импортированный тест"

        base_name = file_name
        counter = 1
        while Test.objects.filter(name=file_name).exists():
            file_name = f"{base_name}_{counter}"
            counter += 1
        test = Test.objects.create(name=file_name)
        test.description = ''
        test.save()
        block_cache = {}
        for row in dataset.dict:
            block_name = row.get('block')
            if block_name:
                block = block_cache.get(block_name)
                if not block:
                    block, _ = Block.objects.get_or_create(name=block_name)
                    block_cache[block_name] = block
                question_text = row.get('question', '')
                question_type = row.get('type', '')
                points = row.get('points', 1)
                answer = row.get('answer', '')
                question_obj, created = Question.objects.get_or_create(
                    block=block,
                    question=question_text,
                    type=question_type,
                    defaults={
                        'block_name': block_name,
                        'points': points,
                        'answer': answer,
                    }
                )
                test.blocks.add(block)
                test.questions.add(question_obj)
        return Result()

class BlockResource(resources.ModelResource):
    class Meta:
        model = Block
        fields = ('id', 'name')

class QuestionResource(resources.ModelResource):
    block_name = fields.Field(column_name='block', attribute='block_name')

    class Meta:
        model = Question
        fields = ('id', 'block_name', 'type', 'points', 'question', 'answer', 'order')

    def before_import_row(self, row, **kwargs):
        block_name = row.get('block')
        if block_name:
            block, _ = Block.objects.get_or_create(name=block_name)
            row['block'] = block.id

    def dehydrate_block_name(self, obj):
        return obj.block.name if obj.block else obj.block_name

class UnfoldImportExportAdmin(ImportExportModelAdmin, ModelAdmin):
    pass

class TestBlockInline(admin.TabularInline):
    model = TestBlock
    extra = 1

@admin.register(Test)
class TestAdmin(UnfoldImportExportAdmin):
    resource_class = TestResource
    list_display = ('id', 'name', 'created_at', 'timer', 'codepass')
    search_fields = ('name',)
    fields = ('name', 'description', 'timer', 'codepass', 'questions', 'created_at')
    readonly_fields = ('created_at',)
    inlines = [TestBlockInline]

    def get_export_formats(self):
        return []  # Отключаем стандартные форматы экспорта

    def has_export_permission(self, request):
        return False  # Полностью отключаем стандартный экспорт

    def import_action(self, request, *args, **kwargs):
        import os
        from import_export.forms import ImportForm
        from django.shortcuts import redirect
        from django.contrib import messages
        import tablib

        if request.method == 'POST' and request.FILES:
            import_file = list(request.FILES.values())[0]
            ext = os.path.splitext(import_file.name)[1].lower()
            if ext in ['.xls', '.xlsx']:
                dataset = tablib.Dataset().load(import_file.read(), format='xlsx')
            elif ext == '.csv':
                dataset = tablib.Dataset().load(import_file.read().decode('utf-8'), format='csv')
            else:
                dataset = tablib.Dataset().load(import_file.read())
            resource = self.resource_class()
            result = resource.import_data(dataset, dry_run=False, import_filename=import_file.name)
            messages.success(request, f"Импорт завершён. Имя теста: {os.path.splitext(import_file.name)[0]}")
            return redirect(request.get_full_path())
        return super().import_action(request, *args, **kwargs)

    def export_action(self, request, *args, **kwargs):
        import os
        from django.http import HttpResponse
        import tablib
        selected = request.POST.getlist('_selected_action')
        if not selected:
            self.message_user(request, "Выберите хотя бы один тест для экспорта.")
            return redirect(request.get_full_path())
        test = Test.objects.get(pk=selected[0])  # Экспортируем только первый выбранный тест
        # Формируем dataset с нужными колонками
        headers = ['block', 'type', 'points', 'question', 'answer']
        data = []
        for question in test.questions.all():
            data.append([
                question.block.name if question.block else '',
                question.type,
                question.points,
                question.question,
                question.answer,
            ])
        dataset = tablib.Dataset(*data, headers=headers)
        export_format = request.POST.get('file_format', 'xlsx')
        if export_format == 'csv':
            response = HttpResponse(dataset.export('csv'), content_type='text/csv')
            filename = f"{test.name}.csv"
        else:
            response = HttpResponse(dataset.export('xlsx'), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            filename = f"{test.name}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    actions = ['export_action']
    export_action.short_description = "Экспортировать тест в Excel/CSV (в формате для импорта)"

@admin.register(Block)
class BlockAdmin(UnfoldImportExportAdmin):
    resource_class = BlockResource
    list_display = ('id', 'name')
    search_fields = ('name',)

@admin.register(Question)
class QuestionAdmin(UnfoldImportExportAdmin):
    resource_class = QuestionResource
    list_display = ('id', 'type', 'points')
    list_filter = ('type',)
    search_fields = ('question',)

@admin.register(TestResult)
class TestResultAdmin(admin.ModelAdmin):
    list_display = ('student_full_name', 'student_group', 'test', 'total_score', 'max_score', 'percent', 'started_at', 'finished_at', 'duration_sec', 'created_at')
    search_fields = ('student_full_name', 'student_group', 'test__name')
    list_filter = ('test', 'student_group', 'created_at')
    readonly_fields = ('created_at',)
