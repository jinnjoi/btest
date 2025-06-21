from django import forms
from .models import Block, Discipline, Competence

class ImportForm(forms.Form):
    import_file = forms.FileField(label='Выберите файл для импорта')

class SmartTestForm(forms.Form):
    name = forms.CharField(label="Название теста", max_length=255)
    blocks = forms.ModelMultipleChoiceField(
        queryset=Block.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        label="Блоки вопросов",
        required=True
    )
    disciplines = forms.ModelMultipleChoiceField(
        queryset=Discipline.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        label="Дисциплины",
        required=True
    )
    competences = forms.ModelMultipleChoiceField(
        queryset=Competence.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        label="Компетенции",
        required=True
    )
    num_questions = forms.IntegerField(
        label="Количество вопросов в тесте",
        min_value=1
    )
    timer = forms.IntegerField(
        label="Таймер (минуты)",
        min_value=1,
        initial=30
    )
    description = forms.CharField(
        label="Описание (необязательно)",
        widget=forms.Textarea,
        required=False
    ) 